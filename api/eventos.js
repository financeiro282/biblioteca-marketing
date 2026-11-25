// GET  /api/eventos            → { eventos: [...] } com busca e filtros (?q, ?ano, ?direito)
// GET  /api/eventos?id=<uuid>  → { evento } (404 se não existe ou a pessoa não pode ver); traz a `versao`
// POST /api/eventos            → { acao: 'criar', evento: {...} }                 → { evento: { id } }
//                                { acao: 'alterar', id, versao, evento: {...} }   → { evento: { id, versao } }
//
// Criar e alterar (25/11/2026, adiantado da Fase 3: o envio precisa de um evento): Marketing e Administrador.
// Conferido AQUI (exigirPermissao) e no BANCO (políticas eventos_incluir / eventos_alterar, pela sessão).
// Campos: compartilhado/evento.js (a mesma regra da tela). Mandar para a lixeira: Fase 3, pelas funções do banco.
// Alterar usa a `versao`: se outra pessoa salvou antes, nada é gravado (409) — ninguém apaga o trabalho do outro.
// Quem filtra o que cada perfil vê é o BANCO (RLS pela sessão): a função buscar_eventos roda com o perfil de quem
// chama — o Colaborador nunca recebe evento "Sem autorização", nem pedindo pelo id.

import { ehUuid, lerFiltros } from '../compartilhado/busca.js';
import { camposAlterados, lerEvento } from '../compartilhado/evento.js';
import { erro, exigirJson, exigirPermissao, exigirSessao, lerCorpo, parametros, responder, responderErro } from './_comum.js';
import { linkDaMiniatura } from './_r2.js';

export function eventoParaTela(e) {
  return {
    id: e.id, nome: e.nome, data_evento: e.data_evento, local: e.local, descricao: e.descricao, tags: e.tags ?? [],
    responsavel: e.responsavel, direito_uso: e.direito_uso,
    capa_url: linkDaMiniatura(e.capa_miniatura),
    total_arquivos: Number(e.total_arquivos) || 0, total_bytes: Number(e.total_bytes) || 0,
    fotos: Number(e.fotos) || 0, videos: Number(e.videos) || 0, raws: Number(e.raws) || 0,
  };
}

const CAMPOS = 'id, nome, data_evento, local, descricao, tags, responsavel, direito_uso, versao';

// Log de ações (Fase 5 mostra): em nome de quem chama (a política log_incluir confere e-mail e perfil). O log nunca
// desfaz o que já foi gravado: se falhar, fica a linha no log da Vercel.
async function registrar(sb, eu, acao, alvoId, detalhes) {
  const { error } = await sb.from('log_acoes').insert({
    email: eu.email, nome: eu.nome, perfil: eu.perfil, acao, alvo_tipo: 'evento', alvo_id: alvoId, detalhes,
  });
  if (error) console.error(`[eventos] log ${acao} não gravado:`, error.message);
}

const invalido = (erros) => Object.assign(erro(400, 'Confira os campos marcados.', 'campos'), { erros });

async function criar(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'organizar');
  const r = lerEvento(corpo.evento);
  if (r.erros) throw invalido(r.erros);
  const { data, error } = await sb.from('eventos').insert({
    ...r.valores,
    criado_por_email: eu.email, criado_por_nome: eu.nome, atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
  }).select('id').single();
  if (error) throw error;
  await registrar(sb, eu, 'evento.criar', data.id, { nome: r.valores.nome, direito_uso: r.valores.direito_uso });
  return { evento: { id: data.id } };
}

async function alterar(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'organizar');
  const id = String(corpo.id ?? '').toLowerCase();
  const versao = Number(corpo.versao);
  if (!ehUuid(id) || !Number.isInteger(versao) || versao < 1) throw erro(400, 'Pedido inválido.');
  const r = lerEvento(corpo.evento);
  if (r.erros) throw invalido(r.erros);

  const { data: atual, error: e1 } = await sb.from('eventos').select(CAMPOS).eq('id', id).maybeSingle();
  if (e1) throw e1;
  if (!atual) throw erro(404, 'Evento não encontrado.', 'nao_encontrado');
  if (atual.versao !== versao) throw erro(409, 'Outra pessoa salvou este evento enquanto você editava. Recarregue a página e faça a mudança de novo.', 'versao');
  const mudou = camposAlterados(atual, r.valores);
  if (!mudou.length) return { evento: { id, versao } };

  // `.eq('versao', …)` de novo: se alguém salvar entre a leitura e esta gravação, nenhuma linha muda.
  const { data, error } = await sb.from('eventos').update({
    ...r.valores, versao: versao + 1, atualizado_em: new Date().toISOString(),
    atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
  }).eq('id', id).eq('versao', versao).select('id, versao');
  if (error) throw error;
  if (!data?.length) throw erro(409, 'Outra pessoa salvou este evento enquanto você editava. Recarregue a página e faça a mudança de novo.', 'versao');
  const detalhes = { campos: mudou };
  if (mudou.includes('direito_uso')) Object.assign(detalhes, { direito_antes: atual.direito_uso, direito_depois: r.valores.direito_uso });
  await registrar(sb, eu, 'evento.alterar', id, detalhes);
  return { evento: { id, versao: data[0].versao } };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      exigirJson(req);
      const corpo = await lerCorpo(req);
      if (corpo.acao === 'criar') return responder(res, 200, await criar(req, corpo));
      if (corpo.acao === 'alterar') return responder(res, 200, await alterar(req, corpo));
      throw erro(400, 'Ação desconhecida.');
    }
    if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não aceito.' });
    const { sb } = await exigirSessao(req);
    const p = parametros(req);
    const f = lerFiltros(p);

    const { data, error } = await sb.rpc('buscar_eventos', {
      p_q: f.q ?? null, p_data: f.data ?? null, p_ano: f.ano ?? null, p_direito: f.direito ?? null,
    });
    if (error) throw error;
    const eventos = (data ?? []).map(eventoParaTela);

    const id = p.get('id');
    if (id !== null) {
      const evento = eventos.find((e) => e.id === String(id).toLowerCase());
      if (!evento) throw erro(404, 'Evento não encontrado.', 'nao_encontrado');
      // A versão vem da tabela (mesmo RLS), para o "Editar evento" saber se alguém salvou no meio.
      const { data: v, error: ev } = await sb.from('eventos').select('versao').eq('id', evento.id).maybeSingle();
      if (ev) throw ev;
      return responder(res, 200, { evento: { ...evento, versao: v?.versao ?? 1 } });
    }
    return responder(res, 200, { eventos });
  } catch (e) {
    if (e?.erros) return responder(res, e.status, { erro: e.message, codigo: e.codigo, erros: e.erros });
    return responderErro(res, e, 'eventos');
  }
}
