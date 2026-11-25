// /api/sessao  (no ar: /biblioteca/api/sessao)
//   GET                                   → { email, nome, perfil } de quem está aqui (401 sem sessão). A tela chama
//                                           ao abrir e quando a pessoa mexe (no máximo a cada 2 min): é o que conta
//                                           como "atividade" para os 30 minutos.
//   POST { acao: 'entrar', passe, volta } → troca o passe com o Portal, cria a sessão (cookie) e devolve { volta }.
//                                           Contrato dos sistemas, item 1. O perfil que vale é o que o Portal mandou
//                                           AGORA (papeis[0]); sem perfil válido → 403.
//   POST { acao: 'sair' }                 → apaga a sessão e o cookie. Não encerra o Portal.
// (Entrar e sair moram aqui para poupar funções: o plano Hobby da Vercel aceita no máximo 12.)

import {
  clienteDoBanco, cookieDeSessao, criarSessao, erro, exigirJson, exigirSessao, formatoDeSessao, lerCookie, lerCorpo,
  perfilDe, portal, responder, responderErro, TETO_HORAS, voltaValida,
} from './_comum.js';

async function entrar(req, res, corpo) {
  if (typeof corpo.passe !== 'string' || corpo.passe.length < 20 || corpo.passe.length > 400) throw erro(400, 'Passe inválido.');
  const p = portal();
  const r = await fetch(`${p.url}/api/passe/trocar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: p.auth },
    body: JSON.stringify({ passe: corpo.passe }),
    signal: AbortSignal.timeout(15_000),
  });
  const quem = await r.json().catch(() => ({}));
  if (!r.ok) throw erro(r.status === 403 ? 403 : 401, quem.erro || 'O Portal não confirmou a entrada.');

  const email = String(quem.email || '').trim().toLowerCase();
  if (!email) throw erro(401, 'O Portal não confirmou a entrada.');
  const perfil = perfilDe(quem.papeis);
  if (!perfil) throw erro(403, 'Seu perfil na Biblioteca de Marketing não foi definido no Portal. Fale com o responsável pelo sistema.');

  const token = await criarSessao({ email, nome: String(quem.nome || '').trim(), perfil });
  res.setHeader('Set-Cookie', cookieDeSessao(token, TETO_HORAS * 3600));
  return responder(res, 200, { ok: true, volta: voltaValida(corpo.volta) ?? '/' });
}

async function sair(req, res) {
  const token = lerCookie(req);
  if (formatoDeSessao(token)) {
    const { error } = await clienteDoBanco(token).rpc('sessao_encerrar');
    if (error) throw error;
  }
  res.setHeader('Set-Cookie', cookieDeSessao('', 0));
  return responder(res, 200, { ok: true });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { eu } = await exigirSessao(req);
      return responder(res, 200, eu);
    }
    if (req.method === 'POST') {
      exigirJson(req);
      const corpo = await lerCorpo(req);
      if (corpo.acao === 'entrar') return await entrar(req, res, corpo);
      if (corpo.acao === 'sair') return await sair(req, res);
      return responder(res, 400, { erro: 'Ação desconhecida.' });
    }
    return responder(res, 405, { erro: 'Método não aceito.' });
  } catch (e) {
    return responderErro(res, e, 'sessao');
  }
}
