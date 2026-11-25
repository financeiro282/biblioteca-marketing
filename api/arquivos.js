// GET /api/arquivos            → { arquivos: [...], total, pagina, por_pagina } com busca e filtros
//                                (?q ?tipo ?ano ?direito ?evento ?aprovadas=1 ?favoritos=1 ?pagina)
// GET /api/arquivos?id=<uuid>  → { arquivo } (404 se não existe ou a pessoa não pode ver)
//
// FASE 1: só consulta. Enviar (Fase 2), editar/aprovar/favoritar/lixeira (Fase 3) e baixar (Fase 4) vêm depois.
// Quem filtra o que cada perfil vê é o BANCO (RLS pela sessão): buscar_arquivos roda com o perfil de quem chama.
// O direito de uso devolvido é o EFETIVO (o mais restritivo entre evento e arquivo), calculado no banco.

import { ehUuid, lerFiltros, POR_PAGINA } from '../compartilhado/busca.js';
import { erro, exigirSessao, parametros, responder, responderErro } from './_comum.js';
import { linkDaMiniatura, linkDaPrevia } from './_r2.js';

export function arquivoParaTela(a) {
  return {
    id: a.id, evento_id: a.evento_id, evento_nome: a.evento_nome, evento_data: a.evento_data,
    tipo: a.tipo, nome_original: a.nome_original, extensao: a.extensao, tamanho_bytes: Number(a.tamanho_bytes) || 0,
    largura: a.largura, altura: a.altura, duracao_seg: a.duracao_seg === null ? null : Number(a.duracao_seg),
    capturado_em: a.capturado_em, camera: a.camera, autor: a.autor, legenda: a.legenda, tags: a.tags ?? [],
    direito_arquivo: a.direito_arquivo, direito_evento: a.direito_evento, direito_efetivo: a.direito_efetivo,
    aprovada: !!a.aprovada, favorito: !!a.favorito,
    miniatura_url: linkDaMiniatura(a.chave_miniatura),
    previa_url: linkDaPrevia(a.chave_previa),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não aceito.' });
    const { sb } = await exigirSessao(req);
    const p = parametros(req);

    const id = p.get('id');
    if (id !== null) {
      if (!ehUuid(id)) throw erro(404, 'Arquivo não encontrado.', 'nao_encontrado');
      // Um arquivo: a mesma função (o mesmo RLS e o mesmo direito efetivo), com p_id.
      const { data, error } = await sb.rpc('buscar_arquivos', { p_id: id.toLowerCase(), p_limite: 1 });
      if (error) throw error;
      const arquivo = (data ?? [])[0];
      if (!arquivo) throw erro(404, 'Arquivo não encontrado.', 'nao_encontrado');
      return responder(res, 200, { arquivo: arquivoParaTela(arquivo) });
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
      arquivos: linhas.map(arquivoParaTela),
      total: linhas.length ? Number(linhas[0].total) : 0,
      pagina: f.pagina, por_pagina: POR_PAGINA,
    });
  } catch (e) {
    return responderErro(res, e, 'arquivos');
  }
}
