// /api/links — links externos (Fase 4, 25/11/2026): Marketing e Administrador (permissão `compartilhar`).
//   GET  /api/links → { links: [...] } mais novos primeiro, com quantos arquivos, acessos e downloads
//   POST /api/links { acao: 'criar', titulo, destinatario?, mensagem?, dias, senha?, ids } → { link, endereco, incluidos, recusados }
//   POST /api/links { acao: 'revogar', id } → { ok }
//
// O ENDEREÇO (com o código) sai UMA vez, na criação: o banco guarda só o sha256 do código, e o código vai no # do
// endereço (não passa por servidor nem fica em log). Perdeu o endereço? Revogue e crie outro.
// Quem entra no link: só arquivo "liberado" em evento "liberado" — o banco confere na criação e a cada acesso
// (link_criar / link_abrir, SQL 02). Senha: só o hash scrypt vai ao banco (api/_senha.js).

import crypto from 'node:crypto';
import { ehUuid } from '../compartilhado/busca.js';
import { lerLink, situacaoDoLink } from '../compartilhado/download.js';
import { erro, exigirJson, exigirPermissao, lerCorpo, registrarAcao, responder, responderErro, sha } from './_comum.js';
import { hashDaSenha } from './_senha.js';

const COLUNAS = 'id, titulo, destinatario, mensagem, expira_em, revogado_em, revogado_por_nome, criado_em, criado_por_nome, '
  + 'criado_por_email, acessos, downloads, ultimo_acesso_em, senha_hash, compartilhamento_arquivos(count)';

export const linkParaTela = (l, agora = Date.now()) => ({
  id: l.id, titulo: l.titulo, destinatario: l.destinatario, mensagem: l.mensagem,
  expira_em: l.expira_em, revogado_em: l.revogado_em, revogado_por_nome: l.revogado_por_nome,
  criado_em: l.criado_em, criado_por_nome: l.criado_por_nome || l.criado_por_email,
  acessos: l.acessos ?? 0, downloads: l.downloads ?? 0, ultimo_acesso_em: l.ultimo_acesso_em ?? null,
  com_senha: !!l.senha_hash, arquivos: l.compartilhamento_arquivos?.[0]?.count ?? 0,
  situacao: situacaoDoLink(l, agora),
});

/** Endereço que o Marketing manda: o do Portal (endereço único), com o código depois do #. */
export function enderecoDoLink(codigo, req) {
  const portal = String(process.env.PORTAL_URL || '').trim().replace(/\/+$/, '');
  const base = portal || `https://${req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost'}`;
  return `${base}/biblioteca/l#${codigo}`;
}

const invalido = (erros) => Object.assign(erro(400, 'Confira os campos marcados.', 'campos'), { erros });

async function listar(req) {
  const { sb } = await exigirPermissao(req, 'compartilhar');
  const { data, error } = await sb.from('compartilhamentos').select(COLUNAS).order('criado_em', { ascending: false }).limit(200);
  if (error) throw error;
  return { links: (data ?? []).map((l) => linkParaTela(l)) };
}

async function criar(req, corpo) {
  const { sb } = await exigirPermissao(req, 'compartilhar');
  const r = lerLink(corpo);
  if (r.erros) throw invalido(r.erros);
  const v = r.valores;
  const codigo = crypto.randomBytes(32).toString('base64url');
  const { data, error } = await sb.rpc('link_criar', {
    p_codigo_hash: sha(codigo), p_titulo: v.titulo, p_destinatario: v.destinatario, p_mensagem: v.mensagem,
    p_senha_hash: v.senha ? await hashDaSenha(v.senha) : null, p_dias: v.dias, p_arquivo_ids: v.ids,
  });
  if (error) {
    if (error.code === '22023' && /uso liberado/.test(error.message)) {
      throw erro(400, 'Nenhum dos arquivos escolhidos tem uso liberado. Link externo só leva arquivo com "Uso liberado" (no arquivo e no evento).', 'sem_liberado');
    }
    if (error.code === '22023') throw erro(400, error.message);
    throw error;
  }
  // A função do banco já gravou o log (link.criar), na mesma operação.
  return {
    link: { id: data.id, expira_em: data.expira_em }, endereco: enderecoDoLink(codigo, req),
    incluidos: data.incluidos, recusados: data.recusados,
  };
}

async function revogar(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'compartilhar');
  const id = String(corpo.id ?? '').toLowerCase();
  if (!ehUuid(id)) throw erro(400, 'Pedido inválido.');
  const { data, error } = await sb.from('compartilhamentos')
    .update({ revogado_em: new Date().toISOString(), revogado_por_email: eu.email, revogado_por_nome: eu.nome })
    .eq('id', id).is('revogado_em', null).select('id');
  if (error) throw error;
  if (!data?.length) {
    const { data: existe, error: e2 } = await sb.from('compartilhamentos').select('id').eq('id', id).maybeSingle();
    if (e2) throw e2;
    if (!existe) throw erro(404, 'Link não encontrado.', 'nao_encontrado');
    return { ok: true, ja_estava: true };
  }
  await registrarAcao(sb, eu, 'link.revogar', 'link', id);
  return { ok: true };
}

const ACOES = { criar, revogar };

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
    return responder(res, 200, await listar(req));
  } catch (e) {
    if (e?.erros) return responder(res, e.status, { erro: e.message, codigo: e.codigo, erros: e.erros });
    return responderErro(res, e, 'links');
  }
}
