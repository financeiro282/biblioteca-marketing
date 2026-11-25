// /api/portal — o que o PORTAL chama aqui (contrato dos sistemas, itens 4 e 5). Uma função só para as duas rotas
// (o plano Hobby da Vercel aceita no máximo 12 funções); o vercel.json repassa:
//   POST /biblioteca/api/portal-evento        → ?rota=evento        aviso assinado ("sair" = encerrar as sessões do e-mail)
//   POST /biblioteca/api/sincronizar-portal   → ?rota=sincronizar   conferência de acessos (Portal: "Conferir acessos")
//   GET  /api/portal (cron diário da Vercel, com Authorization: Bearer CRON_SECRET) → conferência de acessos e,
//        desde a Fase 4, a retomada dos zips parados (api/_zipador.js)
//
// ⚠️ Aviso: o corpo é lido CRU do fluxo e `req.body` nunca é tocado — a assinatura é do texto exato.
// Conferência: o aviso só DISPARA; a lista vem sempre do Portal, buscada aqui com a senha do app. Este sistema não
// tem lista própria de contas: conferir = derrubar a sessão de quem perdeu o acesso ou mudou de perfil (o banco faz,
// na função sessoes_conferir_portal; o perfil novo vale na próxima entrada).

import { assinaturaValida, chamadaDoCron, clienteDoBanco, parametros, perfilDe, portal, responder, responderErro } from './_comum.js';
import { continuarZipsParados } from './_zipador.js';

export { chamadaDoCron };

async function corpoCru(req) {
  const partes = [];
  for await (const p of req) partes.push(typeof p === 'string' ? Buffer.from(p) : p);
  return Buffer.concat(partes).toString('utf8');
}


/** A lista do Portal no formato da função do banco: [{ email, perfil }] (perfil null = sem perfil válido aqui). */
export function listaParaOBanco(pessoasPortal) {
  return (Array.isArray(pessoasPortal) ? pessoasPortal : [])
    .map((p) => ({ email: String(p?.email || '').trim().toLowerCase(), perfil: perfilDe(p?.papeis) }))
    .filter((p) => p.email);
}

async function evento(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não aceito.' });
  const segredo = process.env.PORTAL_SEGREDO;
  if (!segredo) return responder(res, 503, { erro: 'Avisos do Portal não configurados.' });
  const cru = await corpoCru(req);
  if (!assinaturaValida(req.headers['x-portal-assinatura'], segredo, cru)) return responder(res, 401, { erro: 'Aviso não autorizado.' });
  let ev;
  try { ev = JSON.parse(cru); } catch { return responder(res, 400, { erro: 'Aviso inválido.' }); }
  if (ev?.evento === 'sair' && typeof ev.email === 'string') {
    const { data, error } = await clienteDoBanco().rpc('sessoes_encerrar_email', { p_email: ev.email });
    if (error) throw error;
    return responder(res, 200, { ok: true, sessoes_encerradas: data ?? 0 });
  }
  return responder(res, 200, { ok: true, ignorado: true });   // aviso novo não pode quebrar sistema antigo
}

async function sincronizar(req, res) {
  if (!chamadaDoCron(req) && !assinaturaValida(req.headers['x-portal-assinatura'], process.env.PORTAL_SEGREDO)) {
    return responder(res, 401, { erro: 'Chamada não autorizada.' });
  }
  const p = portal();
  const r = await fetch(`${p.url}/api/passe/acessos`, { method: 'POST', headers: { Authorization: p.auth }, signal: AbortSignal.timeout(15_000) });
  const lista = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(lista.pessoas)) return responder(res, 502, { erro: 'O Portal não devolveu a lista de acessos; nada foi mudado.' });
  const { data, error } = await clienteDoBanco().rpc('sessoes_conferir_portal', { p_pessoas: listaParaOBanco(lista.pessoas) });
  if (error) throw error;
  // No cron diário, também os zips parados (rotina que caiu) e os vencidos — Fase 4. Falha aqui não desfaz a conferência.
  let zips = null;
  if (chamadaDoCron(req)) zips = await continuarZipsParados().catch((e) => { console.error('[zip] cron:', e?.message || e); return null; });
  return responder(res, 200, { ok: true, pessoas_com_acesso: lista.pessoas.length, sessoes_encerradas: data ?? 0, zips_retomados: zips });
}

export default async function handler(req, res) {
  try {
    const rota = parametros(req).get('rota') || (req.method === 'GET' ? 'sincronizar' : null);
    if (rota === 'evento') return await evento(req, res);
    if (rota === 'sincronizar') return await sincronizar(req, res);
    return responder(res, 404, { erro: 'Rota desconhecida.' });
  } catch (e) {
    return responderErro(res, e, 'portal');
  }
}
