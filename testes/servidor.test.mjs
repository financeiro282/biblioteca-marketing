// Servidor: assinatura do Portal, token do papel, cookie, perfil e as rotas sem sessão (sem banco de verdade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  assinaturaValida, cookieDeSessao, formatoDeSessao, origemSupabase, perfilDe, sha, tokenDoBanco, voltaValida,
} from '../api/_comum.js';
import { chamadaDoCron, listaParaOBanco } from '../api/portal.js';
import sessao from '../api/sessao.js';
import eventos from '../api/eventos.js';
import arquivos from '../api/arquivos.js';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';
const assinar = (msg, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v=${crypto.createHmac('sha256', sha(SEGREDO)).update(`${t}.${msg}`).digest('hex')}`;

test('assinatura do Portal: confere slug, corpo exato e prazo de 5 minutos', () => {
  assert.ok(assinaturaValida(assinar('biblioteca'), SEGREDO));
  assert.equal(assinaturaValida(assinar('importacao'), SEGREDO), false, 'assinatura de outro sistema');
  const corpo = '{"evento":"sair","email":"a@b.c"}';
  assert.ok(assinaturaValida(assinar(`biblioteca.${corpo}`), SEGREDO, corpo));
  assert.equal(assinaturaValida(assinar(`biblioteca.${corpo}`), SEGREDO, corpo + ' '), false, 'corpo diferente');
  const velho = Math.floor(Date.now() / 1000) - 301;
  assert.equal(assinaturaValida(assinar('biblioteca', velho), SEGREDO), false, 'mais de 5 min');
  assert.equal(assinaturaValida('lixo', SEGREDO), false);
  assert.equal(assinaturaValida(assinar('biblioteca'), ''), false, 'sem segredo configurado');
});

test('token do banco: só do papel app_biblioteca e no prazo (nunca a chave mestra)', () => {
  const token = (conteudo) => ['x', Buffer.from(JSON.stringify(conteudo)).toString('base64url'), 'y'].join('.');
  const daqui1Ano = Math.floor(Date.now() / 1000) + 365 * 86400;
  assert.equal(tokenDoBanco(token({ role: 'app_biblioteca', exp: daqui1Ano })).split('.').length, 3);
  const calado = console.error; console.error = () => {};
  try {
    assert.throws(() => tokenDoBanco(token({ role: 'service_role', exp: daqui1Ano })), /mal configurado/);
    assert.throws(() => tokenDoBanco(token({ role: 'app_importacao', exp: daqui1Ano })), /mal configurado/);
    assert.throws(() => tokenDoBanco(token({ role: 'app_biblioteca', exp: 1 })), /venceu/);
    assert.throws(() => tokenDoBanco(token({ role: 'app_biblioteca' })), /venceu/);
    assert.throws(() => tokenDoBanco('nao-e-token'), /configuração/);
  } finally { console.error = calado; }
});

test('cookie só para /biblioteca/api, httpOnly, Secure, SameSite=Strict; formato do valor', () => {
  const c = cookieDeSessao('abc', 43200);
  for (const parte of ['bib_sessao=abc', 'Path=/biblioteca/api', 'Max-Age=43200', 'HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(c.includes(parte), parte);
  assert.ok(formatoDeSessao(crypto.randomBytes(32).toString('base64url')));
  assert.equal(formatoDeSessao('curto'), false);
  assert.equal(formatoDeSessao(undefined), false);
});

test('perfil vem de papeis[0] e só os códigos daqui; volta só caminho deste sistema; origem do Supabase', () => {
  assert.equal(perfilDe(['marketing', 'admin']), 'marketing');
  assert.equal(perfilDe(['diretoria']), null);
  assert.equal(perfilDe(undefined), null);
  assert.equal(voltaValida('/evento/1?x=2'), '/evento/1?x=2');
  for (const ruim of ['//outro.site', 'https://x', '/\\x', '/a b', '/a#b']) assert.equal(voltaValida(ruim), null, ruim);
  assert.equal(origemSupabase('https://abc.supabase.co/rest/v1/'), 'https://abc.supabase.co');
  assert.equal(origemSupabase('https://abc.supabase.co/outra'), null);
});

test('conferência de acessos: lista do Portal no formato do banco; cron só com o segredo certo', () => {
  assert.deepEqual(listaParaOBanco([{ email: ' A@Importek.com.br ', papeis: ['marketing'] }, { email: 'b@x', papeis: ['outro'] }, { papeis: ['admin'] }]),
    [{ email: 'a@importek.com.br', perfil: 'marketing' }, { email: 'b@x', perfil: null }]);
  const antes = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'c'.repeat(20);
  try {
    assert.ok(chamadaDoCron({ headers: { authorization: `Bearer ${'c'.repeat(20)}` } }));
    assert.equal(chamadaDoCron({ headers: { authorization: 'Bearer errado' } }), false);
    process.env.CRON_SECRET = 'curto';
    assert.equal(chamadaDoCron({ headers: { authorization: 'Bearer curto' } }), false, 'segredo curto demais não vale');
  } finally { process.env.CRON_SECRET = antes; }
});

// Resposta falsa no formato da Vercel.
function resposta() {
  const r = { status: 0, corpo: null, cabecalhos: {} };
  r.status = (s) => { r.codigo = s; return r; };
  r.setHeader = (k, v) => { r.cabecalhos[k] = v; };
  r.json = (c) => { r.corpo = c; return r; };
  return r;
}

test('sem cookie: sessão, eventos e arquivos respondem 401 sem_sessao (nem chegam ao banco)', async () => {
  for (const [nome, rota, url] of [['sessao', sessao, '/api/sessao'], ['eventos', eventos, '/api/eventos'], ['arquivos', arquivos, '/api/arquivos?id=x']]) {
    const res = resposta();
    await rota({ method: 'GET', url, headers: {} }, res);
    assert.equal(res.codigo, 401, nome);
    assert.equal(res.corpo.codigo, 'sem_sessao', nome);
    assert.equal(res.cabecalhos['Cache-Control'], 'no-store', nome);
  }
});

test('entrar exige JSON e um passe com formato válido (antes de falar com o Portal)', async () => {
  let res = resposta();
  await sessao({ method: 'POST', url: '/api/sessao', headers: { 'content-type': 'text/plain' }, body: 'x' }, res);
  assert.equal(res.codigo, 415);
  res = resposta();
  await sessao({ method: 'POST', url: '/api/sessao', headers: { 'content-type': 'application/json' }, body: { acao: 'entrar', passe: 'curto' } }, res);
  assert.equal(res.codigo, 400);
  res = resposta();
  await sessao({ method: 'DELETE', url: '/api/sessao', headers: {} }, res);
  assert.equal(res.codigo, 405);
});

// 25/11/2026: o logo-circulo.png (menu recolhido) ficou fora da lista do vercel.json e, no ar, voltava o index.html.
test('todo arquivo de public/ é entregue pelo vercel.json (fora da lista, vira a página index.html no ar)', async () => {
  const fs = await import('node:fs');
  const raiz = new URL('../', import.meta.url);
  const v = JSON.parse(fs.readFileSync(new URL('vercel.json', raiz), 'utf8'));
  const regra = v.rewrites.find((r) => r.source.startsWith('/biblioteca/:arquivo('));
  assert.ok(regra, 'regra dos arquivos de public/ no vercel.json');
  const lista = regra.source.match(/\(([^)]+)\)/)[1].split('|');
  for (const nome of fs.readdirSync(new URL('public/', raiz))) assert.ok(lista.includes(nome), `public/${nome} fora do vercel.json`);
});
