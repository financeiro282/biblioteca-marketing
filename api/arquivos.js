// GET  /api/arquivos            → { arquivos: [...], total, pagina, por_pagina } com busca e filtros
//                                 (?q ?tipo ?ano ?direito ?evento ?aprovadas=1 ?favoritos=1 ?pagina)
// GET  /api/arquivos?id=<uuid>  → { arquivo } (404 se não existe ou a pessoa não pode ver); traz a `versao`
// GET  /api/arquivos?baixar=<uuid> → { url, nome, tamanho_bytes }: link assinado do ORIGINAL, com o nome que veio
//                                 (1 h para começar). Todos os perfis, só o que a pessoa vê; grava no log (Fase 4).
// POST /api/arquivos            → organização (Fase 3, 25/11/2026):
//   { acao: 'favoritar', id, favorito }                  → todos os perfis (cada um, os seus)
//   { acao: 'alterar', id, versao, arquivo: {...} }       → legenda, autor, tags, direito (Marketing/Admin)
//   { acao: 'lote', ids, mudar: {...} }                  → direito, autor, tags (+/−), aprovar (Marketing/Admin)
//   { acao: 'capa', evento_id, arquivo_id | null }        → capa do evento (Marketing/Admin)
//   { acao: 'lixeira', ids }                             → manda para a lixeira (Marketing/Admin), pela função do banco
//
// Quem filtra o que cada perfil vê é o BANCO (RLS pela sessão): buscar_arquivos roda com o perfil de quem chama.
// O direito de uso devolvido é o EFETIVO (o mais restritivo entre evento e arquivo), calculado no banco.
// Toda gravação: permissão conferida AQUI (exigirPermissao) e no banco (políticas); regras em compartilhado/arquivo.js.
// Alterar um arquivo usa a `versao` (409 se outra pessoa salvou antes). Em lote, cada linha também só muda se
// ninguém a alterou no meio — as que mudaram no meio voltam como "conflitos", sem gravar por cima.

import { ehUuid, lerFiltros, POR_PAGINA } from '../compartilhado/busca.js';
import { direitoEfetivo } from '../compartilhado/direito.js';
import { lerArquivoEditado, lerIds, lerLote, podeAprovar, tagsDepois } from '../compartilhado/arquivo.js';
import { camposAlterados } from '../compartilhado/evento.js';
import {
  erro, exigirJson, exigirPermissao, exigirSessao, lerCorpo, parametros, registrarAcao, responder, responderErro,
} from './_comum.js';
import { linkDaMiniatura, linkDaPrevia, linkDeDownload } from './_r2.js';

export async function arquivoParaTela(a) {
  return {
    id: a.id, evento_id: a.evento_id, evento_nome: a.evento_nome, evento_data: a.evento_data,
    tipo: a.tipo, nome_original: a.nome_original, extensao: a.extensao, tamanho_bytes: Number(a.tamanho_bytes) || 0,
    largura: a.largura, altura: a.altura, duracao_seg: a.duracao_seg === null ? null : Number(a.duracao_seg),
    capturado_em: a.capturado_em, camera: a.camera, autor: a.autor, legenda: a.legenda, tags: a.tags ?? [],
    direito_arquivo: a.direito_arquivo, direito_evento: a.direito_evento, direito_efetivo: a.direito_efetivo,
    aprovada: !!a.aprovada, favorito: !!a.favorito,
    miniatura_url: await linkDaMiniatura(a.chave_miniatura),
    previa_url: await linkDaPrevia(a.chave_previa),
  };
}

const conflito = () => erro(409, 'Outra pessoa salvou este arquivo enquanto você editava. Recarregue a página e faça a mudança de novo.', 'versao');
const naoEncontrado = () => erro(404, 'Arquivo não encontrado.', 'nao_encontrado');
const invalido = (erros) => Object.assign(erro(400, 'Confira os campos marcados.', 'campos'), { erros });

// Quantas gravações ao banco ao mesmo tempo, no lote (500 arquivos ≈ 50 voltas).
async function emLotes(itens, fn, simultaneos = 10) {
  const saida = [];
  for (let i = 0; i < itens.length; i += simultaneos) saida.push(...(await Promise.all(itens.slice(i, i + simultaneos).map(fn))));
  return saida;
}

async function favoritar(req, corpo) {
  const { sb, eu } = await exigirSessao(req);
  const id = String(corpo.id ?? '').toLowerCase();
  if (!ehUuid(id) || typeof corpo.favorito !== 'boolean') throw erro(400, 'Pedido inválido.');
  const email = eu.email.toLowerCase();
  if (corpo.favorito) {
    // O banco só aceita favorito de arquivo que a pessoa enxerga (política favoritos_dono).
    const { error } = await sb.from('favoritos').upsert({ email, arquivo_id: id }, { onConflict: 'email,arquivo_id', ignoreDuplicates: true });
    if (error) { if (error.code === '42501' || error.code === '23503') throw naoEncontrado(); throw error; }
  } else {
    const { error } = await sb.from('favoritos').delete().eq('email', email).eq('arquivo_id', id);
    if (error) throw error;
  }
  return { favorito: corpo.favorito };
}

async function alterar(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'organizar');
  const id = String(corpo.id ?? '').toLowerCase();
  const versao = Number(corpo.versao);
  if (!ehUuid(id) || !Number.isInteger(versao) || versao < 1) throw erro(400, 'Pedido inválido.');
  const r = lerArquivoEditado(corpo.arquivo);
  if (r.erros) throw invalido(r.erros);
  const { data: atual, error: e1 } = await sb.from('arquivos')
    .select('id, evento_id, legenda, autor, tags, direito_uso, aprovada, versao, situacao').eq('id', id).maybeSingle();
  if (e1) throw e1;
  if (!atual || atual.situacao !== 'pronto') throw naoEncontrado();
  if (atual.versao !== versao) throw conflito();
  const mudou = camposAlterados(atual, r.valores);
  if (!mudou.length) return { arquivo: { id, versao } };
  // Ficou "Sem autorização" (somando o evento)? A aprovação cai junto, como no lote.
  let semAprovacao = {};
  if (atual.aprovada) {
    const { data: ev, error: e2 } = await sb.from('eventos').select('direito_uso').eq('id', atual.evento_id).maybeSingle();
    if (e2) throw e2;
    if (!podeAprovar(direitoEfetivo(ev?.direito_uso, r.valores.direito_uso))) {
      semAprovacao = { aprovada: false, aprovada_em: null, aprovada_por_email: null, aprovada_por_nome: null };
      mudou.push('aprovada');
    }
  }
  const { data, error } = await sb.from('arquivos').update({
    ...r.valores, ...semAprovacao, versao: versao + 1, atualizado_em: new Date().toISOString(), atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
  }).eq('id', id).eq('versao', versao).select('id, versao');
  if (error) throw error;
  if (!data?.length) throw conflito();
  const detalhes = { campos: mudou };
  if (mudou.includes('direito_uso')) Object.assign(detalhes, { direito_antes: atual.direito_uso, direito_depois: r.valores.direito_uso });
  await registrarAcao(sb, eu, 'arquivo.alterar', 'arquivo', id, detalhes);
  return { arquivo: { id, versao: data[0].versao } };
}

async function lote(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'organizar');
  const r = lerLote(corpo);
  if (r.erro) throw erro(400, r.erro);
  const { ids, mudar } = r;
  const { data: linhas, error: e1 } = await sb.from('arquivos')
    .select('id, evento_id, tags, autor, direito_uso, aprovada, versao').in('id', ids).eq('situacao', 'pronto');
  if (e1) throw e1;
  // O direito do evento entra na conta de "pode aprovar" (vale o mais restritivo).
  const eventos = [...new Set((linhas ?? []).map((l) => l.evento_id))];
  const { data: evs, error: e2 } = eventos.length ? await sb.from('eventos').select('id, direito_uso').in('id', eventos) : { data: [], error: null };
  if (e2) throw e2;
  const direitoDoEvento = new Map((evs ?? []).map((e) => [e.id, e.direito_uso]));
  const agora = new Date().toISOString();
  let semAutorizacao = 0;

  const resultados = await emLotes(linhas ?? [], async (l) => {
    const novo = {};
    if (mudar.direito_uso !== undefined) novo.direito_uso = mudar.direito_uso;
    if (mudar.autor !== undefined) novo.autor = mudar.autor;
    if (mudar.tags_mais || mudar.tags_menos) novo.tags = tagsDepois(l.tags, mudar.tags_mais, mudar.tags_menos);
    // Aprovação: pedida (true/false) ou a que já estava. Se no fim o arquivo fica "Sem autorização", ela cai
    // (aprovado para uso e proibido ao mesmo tempo não existe).
    const aprova = podeAprovar(direitoEfetivo(direitoDoEvento.get(l.evento_id), novo.direito_uso ?? l.direito_uso));
    if (mudar.aprovada === true && !aprova) semAutorizacao++;
    const aprovadaDepois = (mudar.aprovada ?? l.aprovada) && aprova;
    if (aprovadaDepois !== l.aprovada) {
      Object.assign(novo, aprovadaDepois
        ? { aprovada: true, aprovada_em: agora, aprovada_por_email: eu.email, aprovada_por_nome: eu.nome }
        : { aprovada: false, aprovada_em: null, aprovada_por_email: null, aprovada_por_nome: null });
    }
    if (!camposAlterados(l, novo).length) return 'igual';
    const { data, error } = await sb.from('arquivos').update({
      ...novo, versao: l.versao + 1, atualizado_em: agora, atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
    }).eq('id', l.id).eq('versao', l.versao).select('id');
    if (error) throw error;
    return data?.length ? 'alterado' : 'conflito';
  });
  const alterados = resultados.filter((x) => x === 'alterado').length;
  const conflitos = resultados.filter((x) => x === 'conflito').length;
  if (alterados) {
    await registrarAcao(sb, eu, 'arquivo.alterar_lote', 'arquivo', null, {
      mudou: Object.keys(mudar), quantos: alterados, ids: (linhas ?? []).map((l) => l.id),
      ...(mudar.direito_uso ? { direito_depois: mudar.direito_uso } : {}),
    });
  }
  return { alterados, conflitos, sem_autorizacao: semAutorizacao, nao_encontrados: ids.length - (linhas?.length ?? 0) };
}

async function capa(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'organizar');
  const eventoId = String(corpo.evento_id ?? '').toLowerCase();
  const arquivoId = corpo.arquivo_id === null ? null : String(corpo.arquivo_id ?? '').toLowerCase();
  if (!ehUuid(eventoId) || (arquivoId !== null && !ehUuid(arquivoId))) throw erro(400, 'Pedido inválido.');
  if (arquivoId) {
    const { data: a, error } = await sb.from('arquivos').select('id, evento_id, situacao, chave_miniatura').eq('id', arquivoId).maybeSingle();
    if (error) throw error;
    if (!a || a.situacao !== 'pronto' || a.evento_id !== eventoId) throw naoEncontrado();
    if (!a.chave_miniatura) throw erro(400, 'Este arquivo não tem miniatura para ser a capa.', 'sem_miniatura');
  }
  const { data, error } = await sb.from('eventos').update({ capa_arquivo_id: arquivoId }).eq('id', eventoId).select('id');
  if (error) throw error;
  if (!data?.length) throw erro(404, 'Evento não encontrado.', 'nao_encontrado');
  await registrarAcao(sb, eu, 'evento.capa', 'evento', eventoId, { arquivo_id: arquivoId });
  return { ok: true };
}

async function lixeira(req, corpo) {
  const { sb } = await exigirPermissao(req, 'excluir');
  const ids = lerIds(corpo.ids);
  if (!ids) throw erro(400, 'Escolha de 1 a 500 arquivos.');
  // A função do banco confere o perfil, muda e grava o log junto (o UPDATE comum seria recusado pelo RLS).
  const { data, error } = await sb.rpc('arquivos_para_lixeira', { p_ids: ids });
  if (error) throw error;
  return { na_lixeira: Number(data) || 0 };
}

const ACOES = { favoritar, alterar, lote, capa, lixeira };

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      exigirJson(req);
      const corpo = await lerCorpo(req);
      const acao = ACOES[corpo.acao];
      if (!acao) throw erro(400, 'Ação desconhecida.');
      return responder(res, 200, await acao(req, corpo));
    }
    if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não aceito.' });
    const { sb, eu } = await exigirSessao(req);
    const p = parametros(req);

    const baixar = p.get('baixar');
    if (baixar !== null) {
      if (!ehUuid(baixar)) throw naoEncontrado();
      // Pela mesma função da ficha (RLS + fora da lixeira + pronto); a chave do original vem da tabela (mesmo RLS).
      const { data, error } = await sb.rpc('buscar_arquivos', { p_id: baixar.toLowerCase(), p_limite: 1 });
      if (error) throw error;
      if (!data?.[0]) throw naoEncontrado();
      const { data: a, error: e2 } = await sb.from('arquivos').select('id, chave_original, nome_original, tamanho_bytes').eq('id', data[0].id).maybeSingle();
      if (e2) throw e2;
      if (!a) throw naoEncontrado();
      const url = await linkDeDownload(a.chave_original, a.nome_original);
      if (!url) throw erro(503, 'O armazenamento dos arquivos ainda não está configurado.', 'sem_r2');
      await registrarAcao(sb, eu, 'arquivo.baixar', 'arquivo', a.id, { tamanho: Number(a.tamanho_bytes) || 0 });
      return responder(res, 200, { url, nome: a.nome_original, tamanho_bytes: Number(a.tamanho_bytes) || 0 });
    }

    const id = p.get('id');
    if (id !== null) {
      if (!ehUuid(id)) throw naoEncontrado();
      // Um arquivo: a mesma função (o mesmo RLS e o mesmo direito efetivo), com p_id.
      const { data, error } = await sb.rpc('buscar_arquivos', { p_id: id.toLowerCase(), p_limite: 1 });
      if (error) throw error;
      const arquivo = (data ?? [])[0];
      if (!arquivo) throw naoEncontrado();
      // A versão vem da tabela (mesmo RLS), para o "Editar" saber se alguém salvou no meio.
      const { data: v, error: ev } = await sb.from('arquivos').select('versao').eq('id', arquivo.id).maybeSingle();
      if (ev) throw ev;
      return responder(res, 200, { arquivo: { ...(await arquivoParaTela(arquivo)), versao: v?.versao ?? 1 } });
    }

    const f = lerFiltros(p);
    const { data, error } = await sb.rpc('buscar_arquivos', {
      p_q: f.q ?? null, p_data: f.data ?? null, p_tipo: f.tipo ?? null, p_ano: f.ano ?? null, p_direito: f.direito ?? null,
      p_evento: f.evento ?? null, p_aprovadas: !!f.aprovadas, p_favoritos: !!f.favoritos,
      p_limite: POR_PAGINA, p_deslocamento: (f.pagina - 1) * POR_PAGINA,
    });
    if (error) throw error;
    const linhas = data ?? [];
    return responder(res, 200, {
      arquivos: await Promise.all(linhas.map(arquivoParaTela)),
      total: linhas.length ? Number(linhas[0].total) : 0,
      pagina: f.pagina, por_pagina: POR_PAGINA,
    });
  } catch (e) {
    if (e?.erros) return responder(res, e.status, { erro: e.message, codigo: e.codigo, erros: e.erros });
    return responderErro(res, e, 'arquivos');
  }
}
