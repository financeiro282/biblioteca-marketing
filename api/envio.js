// POST /api/envio — envio de arquivos (Fase 2). Marketing e Administrador (permissão `enviar`, aqui e no banco).
//
//   { acao: 'iniciar', evento_id, nome, tamanho, sha256, direito_uso?, autor? }
//       → { arquivo: { id, modo, parte_bytes, total_partes, partes_prontas: [{numero, etag}] }, links: {...} }
//       → 409 { codigo: 'duplicado', evento_id, evento_nome, arquivo_id } se o mesmo conteúdo (SHA-256) já existe
//   { acao: 'assinar', id, partes: [n, …] }                 → { partes: [{ numero, url }], links: {...} }
//   { acao: 'concluir', id, partes?, metadados?, miniatura?, previa?, toca? } → { arquivo: { id } }
//   { acao: 'cancelar', id }                                → { ok: true }
//
// O ARQUIVO NUNCA PASSA AQUI: o navegador envia direto ao R2 pelos links assinados (15 min, um objeto, uma
// operação). Aqui: conferir quem é, registrar no banco ("enviando"), assinar os links e, no fim, conferir no R2
// que o arquivo chegou INTEIRO (tamanho) antes de marcar "pronto". Regras: compartilhado/envio.js.
//
// RETOMADA: o mesmo arquivo (mesmo SHA-256) que ficou "enviando" (conexão caiu, aba fechada) volta pelo mesmo
// registro e pela mesma chave; no envio em partes, o R2 diz quais partes já chegaram (ListParts) e só o resto sobe.
// Envio abandonado: o R2 descarta as partes em 7 dias (regra do bucket); o registro "enviando" não aparece em
// nenhuma lista (buscar_arquivos só mostra "pronto") e é reaproveitado se o arquivo vier de novo.

import crypto from 'node:crypto';
import { ehUuid } from '../compartilhado/busca.js';
import {
  anoDaChave, chaveMiniatura, chaveOriginal, chavePrevia, lerInicio, lerMetadados, lerPartes, PARTES_POR_PEDIDO,
  planoDeEnvio, VALIDADE_LINK_ENVIO_SEG,
} from '../compartilhado/envio.js';
import { erro, exigirJson, exigirPermissao, lerCorpo, registrarAcao, responder, responderErro } from './_comum.js';
import {
  abortarEnvio, concluirEnvioEmPartes, criarEnvioEmPartes, linkAssinado, partesEnviadas, r2Configurado, tamanhoDoObjeto,
} from './_r2.js';

const CAMPOS = 'id, evento_id, tipo, nome_original, extensao, mime, tamanho_bytes, situacao, chave_original, envio_r2_id, parte_bytes, excluido_em';
const anoDe = (chave) => chave.split('/')[1];
const linkDeEnvio = (chave, consulta = {}) =>
  linkAssinado(chave, { metodo: 'PUT', janelaSeg: 1, validadeSeg: VALIDADE_LINK_ENVIO_SEG, consulta });

// Links de envio do original (envio simples), da miniatura e da prévia (foto grande).
async function linksDoArquivo(a) {
  const ano = anoDe(a.chave_original);
  return {
    original: a.envio_r2_id ? null : await linkDeEnvio(a.chave_original),
    miniatura: await linkDeEnvio(chaveMiniatura(ano, a.id)),
    previa: a.tipo === 'video' ? null : await linkDeEnvio(chavePrevia(ano, a.id)),
  };
}

const paraTela = (a, partesProntas = []) => ({
  id: a.id, modo: a.envio_r2_id ? 'partes' : 'simples', parte_bytes: a.parte_bytes,
  total_partes: a.envio_r2_id ? Math.ceil(Number(a.tamanho_bytes) / a.parte_bytes) : 1,
  partes_prontas: partesProntas.map((p) => ({ numero: p.numero, etag: p.etag })),
});

async function lerArquivo(sb, id) {
  if (!ehUuid(id)) throw erro(400, 'Pedido inválido.');
  const { data, error } = await sb.from('arquivos').select(CAMPOS).eq('id', String(id).toLowerCase()).maybeSingle();
  if (error) throw error;
  if (!data) throw erro(404, 'Envio não encontrado.', 'nao_encontrado');
  return data;
}

async function iniciar(sb, eu, corpo) {
  const r = lerInicio(corpo);
  if (r.erro) throw erro(400, r.erro);
  const v = r.valores;

  // O evento tem de estar visível para quem envia (RLS) e fora da lixeira.
  const { data: ev, error: e1 } = await sb.from('eventos').select('id, nome, data_evento').eq('id', v.evento_id).maybeSingle();
  if (e1) throw e1;
  if (!ev) throw erro(404, 'Evento não encontrado.', 'nao_encontrado');

  // Mesmo conteúdo já existe?
  const { data: ja, error: e2 } = await sb.from('arquivos').select(CAMPOS).eq('sha256', v.sha256).maybeSingle();
  if (e2) throw e2;
  if (ja?.excluido_em) throw erro(409, 'Este arquivo já foi enviado e está na lixeira. Fale com o Administrador para restaurar.', 'na_lixeira');
  if (ja?.situacao === 'pronto') {
    const { data: onde } = await sb.from('eventos').select('id, nome').eq('id', ja.evento_id).maybeSingle();
    throw Object.assign(erro(409, `Este arquivo já está no evento "${onde?.nome ?? 'outro evento'}".`, 'duplicado'),
      { extra: { arquivo_id: ja.id, evento_id: ja.evento_id, evento_nome: onde?.nome ?? null } });
  }

  if (ja) {
    // RETOMADA. Se veio por outro evento, passa para este (ainda não está pronto).
    if (ja.evento_id !== ev.id || ja.nome_original !== v.nome_original) {
      const { error } = await sb.from('arquivos').update({ evento_id: ev.id, nome_original: v.nome_original, direito_uso: v.direito_uso, autor: v.autor })
        .eq('id', ja.id).eq('situacao', 'enviando');
      if (error) throw error;
    }
    let prontas = [];
    const plano = planoDeEnvio(Number(ja.tamanho_bytes));
    if (plano.modo === 'partes') {
      const feitas = ja.envio_r2_id ? await partesEnviadas(ja.chave_original, ja.envio_r2_id) : null;
      if (feitas === null) {
        // Sem envio em partes vivo (cancelado, ou vencido em 7 dias): começa outro na mesma chave.
        ja.envio_r2_id = await criarEnvioEmPartes(ja.chave_original, ja.mime);
        ja.parte_bytes = ja.parte_bytes ?? plano.parte_bytes;
        const { error } = await sb.from('arquivos').update({ envio_r2_id: ja.envio_r2_id, parte_bytes: ja.parte_bytes })
          .eq('id', ja.id).eq('situacao', 'enviando');
        if (error) throw error;
      } else {
        // Só vale parte inteira do tamanho combinado (a última pode ser menor).
        const ultima = Math.ceil(Number(ja.tamanho_bytes) / ja.parte_bytes);
        prontas = feitas.filter((p) => p.tamanho === ja.parte_bytes || p.numero === ultima);
      }
    }
    return { arquivo: paraTela(ja, prontas), links: await linksDoArquivo(ja), retomada: true };
  }

  const id = crypto.randomUUID();
  const chave = chaveOriginal(anoDaChave(ev.data_evento), id, v.extensao);
  const plano = planoDeEnvio(v.tamanho_bytes);
  const envioId = plano.modo === 'partes' ? await criarEnvioEmPartes(chave, v.mime) : null;
  const linha = {
    id, evento_id: ev.id, tipo: v.tipo, nome_original: v.nome_original, extensao: v.extensao, mime: v.mime,
    tamanho_bytes: v.tamanho_bytes, sha256: v.sha256, chave_original: chave, situacao: 'enviando',
    envio_r2_id: envioId, parte_bytes: plano.parte_bytes, direito_uso: v.direito_uso, autor: v.autor,
    criado_por_email: eu.email, criado_por_nome: eu.nome, atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
  };
  const { error: e3 } = await sb.from('arquivos').insert(linha);
  if (e3) {
    if (envioId) await abortarEnvio(chave, envioId).catch(() => {});
    // Mesmo SHA-256 que esta pessoa não enxerga (lixeira, para o Marketing) ou enviado ao mesmo tempo por outra.
    if (e3.code === '23505') throw erro(409, 'Este arquivo já foi enviado (pode estar na lixeira). Fale com o Administrador.', 'duplicado_oculto');
    throw e3;
  }
  return { arquivo: paraTela({ ...linha, excluido_em: null }), links: await linksDoArquivo(linha), retomada: false };
}

async function assinar(sb, corpo) {
  const a = await lerArquivo(sb, corpo.id);
  if (a.situacao !== 'enviando') throw erro(409, 'Este arquivo já foi concluído.', 'concluido');
  const total = a.envio_r2_id ? Math.ceil(Number(a.tamanho_bytes) / a.parte_bytes) : 1;
  const pedidas = Array.isArray(corpo.partes) ? corpo.partes.map(Number) : [];
  if (pedidas.length > PARTES_POR_PEDIDO || pedidas.some((n) => !Number.isInteger(n) || n < 1 || n > total)) throw erro(400, 'Pedido inválido.');
  if (pedidas.length && !a.envio_r2_id) throw erro(400, 'Pedido inválido.');
  const partes = await Promise.all(pedidas.map(async (numero) => ({
    numero, url: await linkDeEnvio(a.chave_original, { partNumber: numero, uploadId: a.envio_r2_id }),
  })));
  return { partes, links: await linksDoArquivo(a) };
}

async function concluir(sb, eu, corpo) {
  const a = await lerArquivo(sb, corpo.id);
  if (a.situacao === 'pronto') return { arquivo: { id: a.id } }; // pedido repetido (a resposta anterior se perdeu)
  const tamanho = Number(a.tamanho_bytes);

  if (a.envio_r2_id) {
    const partes = lerPartes(corpo.partes, Math.ceil(tamanho / a.parte_bytes));
    if (!partes) throw erro(400, 'Faltam partes do arquivo. Envie de novo.', 'partes');
    try {
      await concluirEnvioEmPartes(a.chave_original, a.envio_r2_id, partes);
    } catch (e) {
      // Já juntado num pedido anterior cuja resposta se perdeu: o objeto existe com o tamanho certo.
      if (e?.r2 !== 'NoSuchUpload' || (await tamanhoDoObjeto(a.chave_original)) !== tamanho) throw e;
    }
  }
  // O arquivo chegou INTEIRO? (o tamanho no R2 tem de ser o declarado no início)
  const noR2 = await tamanhoDoObjeto(a.chave_original);
  if (noR2 !== tamanho) throw erro(409, 'O arquivo não chegou inteiro ao armazenamento. Envie de novo.', 'incompleto');

  const ano = anoDe(a.chave_original);
  const existe = async (chave, pedido) => (pedido && (await tamanhoDoObjeto(chave)) > 0 ? chave : null);
  const [chave_miniatura, chave_previa] = await Promise.all([
    existe(chaveMiniatura(ano, a.id), corpo.miniatura === true),
    existe(chavePrevia(ano, a.id), corpo.previa === true && a.tipo !== 'video'),
  ]);
  const m = lerMetadados(corpo.metadados);
  const agora = new Date().toISOString();
  const { data, error } = await sb.from('arquivos').update({
    situacao: 'pronto', enviado_em: agora, envio_r2_id: null, chave_miniatura, chave_previa, ...m,
    atualizado_em: agora, atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
  }).eq('id', a.id).eq('situacao', 'enviando').select('id');
  if (error) throw error;
  if (data?.length) {
    const detalhes = { nome: a.nome_original, tipo: a.tipo, tamanho_bytes: tamanho, evento_id: a.evento_id };
    // Medição da Fase 2: quantos vídeos não tocam no navegador (decide a prévia de vídeo).
    if (a.tipo === 'video' && typeof corpo.toca === 'boolean') detalhes.toca_no_navegador = corpo.toca;
    await registrarAcao(sb, eu, 'arquivo.enviar', 'arquivo', a.id, detalhes);
  }
  return { arquivo: { id: a.id } };
}

async function cancelar(sb, corpo) {
  const a = await lerArquivo(sb, corpo.id);
  if (a.situacao !== 'enviando') return { ok: true };
  if (a.envio_r2_id) {
    await abortarEnvio(a.chave_original, a.envio_r2_id);
    const { error } = await sb.from('arquivos').update({ envio_r2_id: null }).eq('id', a.id).eq('situacao', 'enviando');
    if (error) throw error;
  }
  return { ok: true };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não aceito.' });
    exigirJson(req);
    const corpo = await lerCorpo(req);
    const { sb, eu } = await exigirPermissao(req, 'enviar');
    if (!r2Configurado()) throw erro(503, 'O armazenamento de arquivos ainda não está configurado. Avise o responsável pelo sistema.', 'sem_r2');
    if (corpo.acao === 'iniciar') return responder(res, 200, await iniciar(sb, eu, corpo));
    if (corpo.acao === 'assinar') return responder(res, 200, await assinar(sb, corpo));
    if (corpo.acao === 'concluir') return responder(res, 200, await concluir(sb, eu, corpo));
    if (corpo.acao === 'cancelar') return responder(res, 200, await cancelar(sb, corpo));
    throw erro(400, 'Ação desconhecida.');
  } catch (e) {
    if (e?.extra) return responder(res, e.status, { erro: e.message, codigo: e.codigo, ...e.extra });
    return responderErro(res, e, 'envio');
  }
}
