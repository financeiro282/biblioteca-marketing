// Peças comuns do servidor da Biblioteca de Marketing (funções da Vercel).
// Mesmo desenho da Importação e dos Prospects (contrato em portal-importek/docs/CONTRATO-DOS-SISTEMAS.md), com
// UMA diferença importante no banco: o RLS depende da SESSÃO da pessoa.
//
// BANCO = o do PORTAL, no modelo da unificação (importek-sistemas/README.md): área `biblioteca`, papel próprio
// `app_biblioteca`. NUNCA a chave mestra (service role): o servidor fala com o banco com o TOKEN desse papel
// (BIBLIOTECA_DB_TOKEN) e `tokenDoBanco()` recusa token de outro papel ou vencido.
//
// SESSÃO PELO BANCO: o valor do cookie da pessoa vai, em TODO pedido ao banco, no cabeçalho `x-biblioteca-sessao`.
// O banco calcula o sha256, acha a sessão e o perfil, e as políticas filtram tudo por ele. Sem sessão válida, o
// banco não devolve NENHUMA linha — nem para este servidor. Por isso cada pedido usa um cliente do banco PRÓPRIO
// (clienteDaPessoa), nunca um cliente compartilhado entre pessoas.
//   • 30 min sem uso → acabou; 12 h desde a entrada → acabou (o banco confere; aqui também);
//   • "Sair" no Portal ou pessoa desativada → apagada na hora (api/portal.js).
//
// O navegador NUNCA fala com o banco nem com o R2 com chave: não há chave nem token no site; tudo passa por api/.
// PERFIS: compartilhado/perfis.js. Toda rota que grava confere a permissão AQUI (exigirPermissao), além do banco.
//
// ENDEREÇO ÚNICO: o site mora em portal-importek…/biblioteca/ (o Portal repassa); a API, em /biblioteca/api.
// O cookie só vai para /biblioteca/api.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CODIGOS, pode } from '../compartilhado/perfis.js';

export const SLUG = 'biblioteca';
export const AREA = 'biblioteca';            // schema no banco do Portal
export const PAPEL = 'app_biblioteca';       // papel próprio deste sistema
export const PERFIS = CODIGOS;
export { pode };
export const INATIVIDADE_MIN = 30;
export const TETO_HORAS = 12;
export const CABECALHO_SESSAO = 'x-biblioteca-sessao';
const COOKIE = 'bib_sessao';
export const COOKIE_CAMINHO = '/biblioteca/api';

export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function responder(res, status, corpo) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  return res.json(corpo);
}

export function erro(status, mensagem, codigo) {
  return Object.assign(new Error(mensagem), { status, codigo });
}

export function responderErro(res, e, onde) {
  if (e?.status) return responder(res, e.status, { erro: e.message, codigo: e.codigo });
  // Recusa do RLS (42501) que escapou da conferência daqui: não é erro do servidor, é falta de permissão.
  if (e?.code === '42501') return responder(res, 403, { erro: 'Seu perfil não permite isto.', codigo: 'sem_permissao' });
  console.error(`[${onde}]`, e?.message || e);
  return responder(res, 500, { erro: 'Algo deu errado no servidor. Tente de novo em instantes.' });
}

// O endereço do projeto tem de ser só a origem (https://<projeto>.supabase.co). Colado com o caminho da API
// (".../rest/v1/"), cada pedido iria para /rest/v1/rest/v1/… (aconteceu nos Prospects, 09/11/2026).
export function origemSupabase(url) {
  const s = String(url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/+$/, '');
  return /^https:\/\/[^/\s?#]+$/.test(s) ? s : null;
}

// ── token do papel ──────────────────────────────────────────────────────────
// Lê o conteúdo do token (sem conferir a assinatura — quem confere é o Supabase) para saber o papel e a validade.
export function lerToken(token) {
  const partes = String(token || '').trim().split('.');
  if (partes.length !== 3) return null;
  try {
    const c = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

/** Dias até o token vencer (negativo = vencido); null se não tiver validade. */
export function diasParaVencer(conteudo, agora = Date.now()) {
  const exp = Number(conteudo?.exp);
  return Number.isFinite(exp) ? Math.floor((exp * 1000 - agora) / 86_400_000) : null;
}

/** O token só serve se for do papel app_biblioteca e estiver no prazo. Devolve o token limpo. */
export function tokenDoBanco(token, agora = Date.now()) {
  const c = lerToken(token);
  if (!c) throw erro(500, 'Servidor sem configuração do banco.');
  if (c.role !== PAPEL) {
    // Nunca dizer no log QUAL papel veio — só que não é o deste sistema.
    console.error(`[banco] BIBLIOTECA_DB_TOKEN não é do papel ${PAPEL}. O sistema não usa outro papel (nem a chave mestra).`);
    throw erro(500, 'Servidor com o acesso ao banco mal configurado.');
  }
  const dias = diasParaVencer(c, agora);
  if (dias === null || dias < 0) {
    console.error('[banco] BIBLIOTECA_DB_TOKEN vencido ou sem validade: gerar outro (importek-sistemas/banco/biblioteca/LEIA-ME.md).');
    throw erro(503, 'O acesso deste sistema ao banco venceu. Avise o responsável pelo sistema.');
  }
  return String(token).trim();
}

function configuracaoDoBanco() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BIBLIOTECA_DB_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !BIBLIOTECA_DB_TOKEN) throw erro(500, 'Servidor sem configuração do banco.');
  const origem = origemSupabase(SUPABASE_URL);
  if (!origem) {
    console.error('[banco] SUPABASE_URL tem de ser só https://<projeto>.supabase.co (o do Portal).');
    throw erro(500, 'Servidor com o endereço do banco mal configurado.');
  }
  return { origem, chave: SUPABASE_PUBLISHABLE_KEY.trim(), token: tokenDoBanco(BIBLIOTECA_DB_TOKEN) };
}

// Cliente do banco para UM pedido. Com `sessao` (o valor do cookie), o banco enxerga a pessoa; sem, só as funções
// que não dependem de pessoa (criar sessão, "Sair" do Portal, conferência de acessos) funcionam — as tabelas
// devolvem zero linhas. A chave pública só identifica o projeto; quem dá o acesso é o token do papel.
export function clienteDoBanco(sessao = null) {
  const { origem, chave, token } = configuracaoDoBanco();
  return createClient(origem, chave, {
    db: { schema: AREA },
    accessToken: async () => token,
    global: sessao ? { headers: { [CABECALHO_SESSAO]: sessao } } : undefined,
  });
}

export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { throw erro(400, 'Pedido inválido.'); } }
  return {};
}

// Pedido que muda algo tem de vir da própria página (JSON): um formulário de outro site não consegue mandar
// Content-Type JSON sem o navegador barrar. Soma ao SameSite=Strict do cookie.
export function exigirJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw erro(415, 'Pedido inválido.');
  }
}

// ── cookie ──────────────────────────────────────────────────────────────────
export function lerCookie(req, nome = COOKIE) {
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function cookieDeSessao(valor, maxAgeSeg) {
  return `${COOKIE}=${encodeURIComponent(valor)}; Path=${COOKIE_CAMINHO}; Max-Age=${maxAgeSeg}; HttpOnly; Secure; SameSite=Strict`;
}

/** O valor do cookie tem o formato que este servidor sorteia (32 bytes em base64url)? */
export const formatoDeSessao = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

// ── perfil que o Portal mandou ──────────────────────────────────────────────
// O que vale é papeis[0] (o perfil principal); só os códigos deste sistema.
export function perfilDe(papeis) {
  const p = Array.isArray(papeis) ? String(papeis[0] ?? '') : '';
  return PERFIS.includes(p) ? p : null;
}

// ── sessão ──────────────────────────────────────────────────────────────────
/** Entrada pelo Portal: sorteia o valor do cookie e grava só o sha256 (função do banco). */
export async function criarSessao({ email, nome, perfil }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const { error } = await clienteDoBanco().rpc('sessao_criar', { p_token_hash: sha(token), p_email: email, p_nome: nome || email, p_perfil: perfil });
  if (error) throw error;
  return token;
}

// Confere a sessão de quem chama (o banco confere e conta como atividade). Devolve { sb, eu } ou erro 401.
// `sb` é o cliente do banco DESTA pessoa: as políticas do RLS filtram tudo pelo perfil dela.
export async function exigirSessao(req) {
  const token = lerCookie(req);
  if (!formatoDeSessao(token)) throw erro(401, 'Entre pelo Portal Importek.', 'sem_sessao');
  const sb = clienteDoBanco(token);
  const { data, error } = await sb.rpc('sessao_conferir');
  if (error) throw error;
  const s = Array.isArray(data) ? data[0] : data;
  if (!s?.email || !PERFIS.includes(s.perfil)) throw erro(401, 'Sua sessão terminou. Entre de novo pelo Portal.', 'sem_sessao');
  return { sb, eu: { email: s.email, nome: s.nome, perfil: s.perfil }, token };
}

const SEM_PERMISSAO = {
  enviar: 'Seu perfil não envia arquivos.',
  organizar: 'Seu perfil não altera eventos nem arquivos.',
  excluir: 'Seu perfil não exclui.',
  compartilhar: 'Seu perfil não cria links externos.',
  ver_uso: 'Seu perfil não vê o painel de uso.',
  lixeira: 'Só o Administrador vê e restaura a lixeira.',
  relatorios: 'Só o Administrador vê os relatórios.',
  configurar: 'Só o Administrador altera a configuração.',
};

/** Recusa (403) se o perfil não tem a permissão. */
export function conferirPermissao(eu, permissao) {
  if (!pode(eu.perfil, permissao)) {
    throw erro(403, `${SEM_PERMISSAO[permissao] || 'Seu perfil não permite isto.'} Fale com o responsável pelo sistema no Portal.`, 'sem_permissao');
  }
}

/** Sessão válida E com a permissão (compartilhado/perfis.js). Conferido no servidor em toda rota que grava. */
export async function exigirPermissao(req, permissao) {
  const r = await exigirSessao(req);
  conferirPermissao(r.eu, permissao);
  return r;
}

// ── Portal ──────────────────────────────────────────────────────────────────
export function portal() {
  const { PORTAL_URL, PORTAL_SEGREDO } = process.env;
  if (!PORTAL_URL || !PORTAL_SEGREDO) throw erro(500, 'Ligação com o Portal não configurada.');
  return { url: PORTAL_URL.replace(/\/+$/, ''), segredo: PORTAL_SEGREDO, auth: `App ${SLUG}:${PORTAL_SEGREDO}` };
}

// Assinatura do Portal (contrato dos sistemas, itens 4 e 5):
//   X-Portal-Assinatura: t=<unix>,v=<hex>,  v = HMAC-SHA256(chave = sha256(PORTAL_SEGREDO), mensagem)
//   mensagem = "<t>.biblioteca" (conferência) ou "<t>.biblioteca.<corpo exato>" (avisos).
export function assinaturaValida(cabecalho, segredo, corpo = null, agora = Date.now() / 1000) {
  const m = /^t=(\d{1,12}),v=([0-9a-f]{64})$/.exec(String(cabecalho || ''));
  if (!m || !segredo || Math.abs(agora - Number(m[1])) > 300) return false;
  const msg = corpo === null ? `${m[1]}.${SLUG}` : `${m[1]}.${SLUG}.${corpo}`;
  const esperado = crypto.createHmac('sha256', sha(segredo)).update(msg).digest();
  return crypto.timingSafeEqual(esperado, Buffer.from(m[2], 'hex'));
}

// Caminho de volta dentro do app: só caminho relativo daqui, nunca outro site.
export function voltaValida(v) {
  return typeof v === 'string' && /^\/(?![/\\])[^\s\\#]{0,500}$/.test(v) ? v : null;
}

/** Parâmetros da URL do pedido (a Vercel entrega req.query; nos testes, só req.url). */
export function parametros(req) {
  return new URL(req.url || '/', 'http://local').searchParams;
}
