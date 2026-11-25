// GET /api/eventos            → { eventos: [...] } com busca e filtros (?q, ?ano, ?direito)
// GET /api/eventos?id=<uuid>  → { evento } (404 se não existe ou a pessoa não pode ver)
//
// FASE 1: só consulta. Criar, alterar e mandar para a lixeira entram na Fase 3 (organização).
// Quem filtra o que cada perfil vê é o BANCO (RLS pela sessão): a função buscar_eventos roda com o perfil de quem
// chama — o Colaborador nunca recebe evento "Sem autorização", nem pedindo pelo id.

import { lerFiltros } from '../compartilhado/busca.js';
import { erro, exigirSessao, parametros, responder, responderErro } from './_comum.js';
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

export default async function handler(req, res) {
  try {
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
      return responder(res, 200, { evento });
    }
    return responder(res, 200, { eventos });
  } catch (e) {
    return responderErro(res, e, 'eventos');
  }
}
