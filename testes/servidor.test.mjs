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

test('criar/alterar evento: só JSON, e sem cookie nem chega ao banco (401)', async () => {
  let res = resposta();
  await eventos({ method: 'POST', url: '/api/eventos', headers: { 'content-type': 'text/plain' }, body: 'x' }, res);
  assert.equal(res.codigo, 415);
  res = resposta();
  await eventos({ method: 'POST', url: '/api/eventos', headers: { 'content-type': 'application/json' }, body: { acao: 'criar', evento: {} } }, res);
  assert.equal(res.codigo, 401);
  assert.equal(res.corpo.codigo, 'sem_sessao');
  res = resposta();
  await eventos({ method: 'DELETE', url: '/api/eventos', headers: {} }, res);
  assert.equal(res.codigo, 405);
});

test('R2: link assinado no formato de caminho, só da conta certa, estável na janela de 10 min', async () => {
  const r2 = await import('../api/_r2.js');
  const antes = { ...process.env };
  Object.assign(process.env, { R2_CONTA: 'a'.repeat(32), R2_CHAVE_ID: 'id-de-teste', R2_CHAVE_SEGREDO: 'segredo-de-teste', R2_BUCKET: 'importek-biblioteca-teste' });
  try {
    const agora = Date.parse('2026-11-25T14:03:00Z');
    const u = new URL(await r2.linkAssinado('miniaturas/2026/x.jpg', { agora }));
    assert.equal(u.origin, `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    assert.equal(u.pathname, '/importek-biblioteca-teste/miniaturas/2026/x.jpg');
    assert.equal(u.searchParams.get('X-Amz-Expires'), '1200');
    assert.equal(u.searchParams.get('X-Amz-Date'), '20261125T140000Z', 'hora arredondada para a janela');
    assert.match(u.searchParams.get('X-Amz-Credential'), /^id-de-teste\/20261125\/auto\/s3\/aws4_request$/);
    assert.match(u.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
    assert.equal(await r2.linkAssinado('miniaturas/2026/x.jpg', { agora: agora + 5 * 60_000 }), u.toString(), 'mesma janela = mesmo link');
    const parte = new URL(await r2.linkAssinado('originais/2026/x.mp4', { metodo: 'PUT', janelaSeg: 1, validadeSeg: 900, consulta: { partNumber: 3, uploadId: 'abc' }, agora }));
    assert.equal(parte.searchParams.get('partNumber'), '3');
    assert.equal(parte.searchParams.get('X-Amz-Expires'), '900');
    process.env.R2_CONTA = 'conta-invalida';
    assert.equal(await r2.linkAssinado('x', { agora }), null, 'conta em formato errado: sem link');
  } finally {
    for (const k of ['R2_CONTA', 'R2_CHAVE_ID', 'R2_CHAVE_SEGREDO', 'R2_BUCKET']) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
  }
  assert.equal(await r2.linkDaMiniatura('miniaturas/2026/x.jpg'), null, 'sem R2 configurado: null');
  const xml = '<ListPartsResult><IsTruncated>true</IsTruncated><NextPartNumberMarker>2</NextPartNumberMarker>'
    + '<Part><PartNumber>1</PartNumber><ETag>&quot;e1&quot;</ETag><Size>16777216</Size></Part>'
    + '<Part><PartNumber>2</PartNumber><ETag>"e2"</ETag><Size>100</Size></Part></ListPartsResult>';
  assert.deepEqual(r2.lerListaDePartes(xml), { partes: [{ numero: 1, etag: '"e1"', tamanho: 16777216 }, { numero: 2, etag: '"e2"', tamanho: 100 }], truncado: true, proximo: '2' });
  assert.equal(r2.xmlDeConclusao([{ numero: 1, etag: 'a' }, { numero: 2, etag: '"b"' }]),
    '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"a"</ETag></Part><Part><PartNumber>2</PartNumber><ETag>"b"</ETag></Part></CompleteMultipartUpload>');
});

test('envio: só POST com JSON, e sem cookie nem chega ao banco ou ao R2', async () => {
  const envio = (await import('../api/envio.js')).default;
  let res = resposta();
  await envio({ method: 'GET', url: '/api/envio', headers: {} }, res);
  assert.equal(res.codigo, 405);
  res = resposta();
  await envio({ method: 'POST', url: '/api/envio', headers: { 'content-type': 'text/plain' }, body: 'x' }, res);
  assert.equal(res.codigo, 415);
  res = resposta();
  await envio({ method: 'POST', url: '/api/envio', headers: { 'content-type': 'application/json' }, body: { acao: 'iniciar' } }, res);
  assert.equal(res.codigo, 401);
});

test('organizar arquivos e lixeira do evento: só JSON, ação conhecida, e sem cookie nem chega ao banco', async () => {
  let res = resposta();
  await arquivos({ method: 'POST', url: '/api/arquivos', headers: { 'content-type': 'text/plain' }, body: 'x' }, res);
  assert.equal(res.codigo, 415);
  res = resposta();
  await arquivos({ method: 'POST', url: '/api/arquivos', headers: { 'content-type': 'application/json' }, body: { acao: 'apagar_tudo' } }, res);
  assert.equal(res.codigo, 400);
  for (const corpo of [{ acao: 'favoritar', id: 'x', favorito: true }, { acao: 'lote', ids: [], mudar: {} }, { acao: 'lixeira', ids: [] }]) {
    res = resposta();
    await arquivos({ method: 'POST', url: '/api/arquivos', headers: { 'content-type': 'application/json' }, body: corpo }, res);
    assert.equal(res.codigo, 401, corpo.acao);
  }
  res = resposta();
  await eventos({ method: 'POST', url: '/api/eventos', headers: { 'content-type': 'application/json' }, body: { acao: 'lixeira', id: 'x' } }, res);
  assert.equal(res.codigo, 401);
});

// ── Fase 4: zip, download, senha e link externo ──────────────────────────────────────────────────────────

// Leitor mínimo de zip (só o que o teste precisa): diretório central → nomes, CRC, tamanhos e o conteúdo.
function lerZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fim >= 0, 'tem o fim do diretório');
  const quantos = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const entradas = [];
  for (let i = 0; i < quantos; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'entrada central');
    const flags = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 16);
    const tamanho = buf.readUInt32LE(p + 24);
    const nomeLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + nomeLen).toString('utf8');
    assert.equal(buf.readUInt32LE(local), 0x04034b50, `cabeçalho local de ${nome}`);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamanho);
    assert.equal(buf.readUInt32LE(ini + tamanho), 0x08074b50, `descritor depois de ${nome}`);
    entradas.push({ nome, flags, crc, tamanho, dados });
    p += 46 + nomeLen;
  }
  return entradas;
}

test('zip: monta em fluxo, na ordem, com CRC certo, nomes UTF-8 e blocos iguais (regra do R2); abre no tar do Windows', async () => {
  const { montarZip, juntadorDePartes, dataDos } = await import('../api/_zip.js');
  const { nomesNoZip } = await import('../compartilhado/download.js');
  const zlib = await import('node:zlib');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const arquivos = [
    { chave: 'a', nome: 'Palestra — São Paulo.JPG', evento: 'Convenção', dados: crypto.randomBytes(9 * 1024 * 1024 + 7) },
    { chave: 'b', nome: 'IMG_1.HEIC', evento: 'Convenção', dados: crypto.randomBytes(1000) },
    { chave: 'c', nome: 'IMG_1.HEIC', evento: 'Convenção', dados: crypto.randomBytes(2000) },
  ];
  const nomes = nomesNoZip(arquivos);
  assert.deepEqual(nomes, ['Palestra — São Paulo.JPG', 'IMG_1.HEIC', 'IMG_1 (2).HEIC'], 'um evento só: sem pasta; repetido ganha (2)');
  const blocos = [];
  const saida = juntadorDePartes({ tamanhoParte: 5 * 1024 * 1024, enviar: async (n, b) => { blocos[n - 1] = Buffer.from(b); return `e${n}`; } });
  const porChave = new Map(arquivos.map((a) => [a.chave, a.dados]));
  const r = await montarZip({
    arquivos: arquivos.map((a, i) => ({ chave: a.chave, nomeNoZip: nomes[i], tamanho: a.dados.length, data: '2026-10-01T13:45:10Z' })),
    // leituras que voltam fora de ordem (cada uma demora diferente): o zip tem de sair na ordem certa
    ler: async (c, ini, fim) => { await new Promise((ok) => setTimeout(ok, Math.random() * 8)); return new Uint8Array(porChave.get(c).subarray(ini, fim)); },
    escrever: (b) => saida.escrever(b), pedaco: 2 * 1024 * 1024,
  });
  const partes = await saida.terminar();
  const zip = Buffer.concat(blocos);
  assert.equal(r.bytes, zip.length);
  assert.equal(r.arquivos, 3);
  assert.deepEqual(partes.map((p) => p.numero), blocos.map((_, i) => i + 1));
  assert.ok(blocos.slice(0, -1).every((b) => b.length === 5 * 1024 * 1024), 'todos os blocos iguais, menos o último');
  const lidas = lerZip(zip);
  for (const [i, e] of lidas.entries()) {
    assert.equal(e.nome, nomes[i]);
    assert.equal(e.flags, 0x0808, 'descritor depois + UTF-8');
    assert.equal(e.tamanho, arquivos[i].dados.length);
    assert.ok(e.dados.equals(arquivos[i].dados), `conteúdo de ${e.nome}`);
    assert.equal(e.crc, zlib.crc32(arquivos[i].dados));
  }
  const d = dataDos('2026-10-01T13:45:10Z');
  assert.equal(d.hora >> 11, 10, 'hora de Brasília (13:45 UTC = 10:45)');
  assert.equal((d.dia >> 9) + 1980, 2026);
  // Leitura que falha: o erro sobe (a rotina marca a parte para tentar de novo)
  await assert.rejects(montarZip({ arquivos: [{ chave: 'x', nomeNoZip: 'x', tamanho: 10 }], ler: async () => { throw new Error('R2 fora'); }, escrever: async () => {} }), /R2 fora/);
  await assert.rejects(montarZip({ arquivos: [{ chave: 'x', nomeNoZip: 'x', tamanho: 10 }], ler: async () => new Uint8Array(5), escrever: async () => {} }), /incompleta/);
  // O tar do Windows (o mesmo formato que o Explorer abre), se existir nesta máquina
  const tar = 'C:/Windows/System32/tar.exe';
  if (fs.existsSync(tar)) {
    const { execFileSync } = await import('node:child_process');
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    fs.writeFileSync(path.join(pasta, 't.zip'), zip);
    execFileSync(tar, ['-xf', path.join(pasta, 't.zip'), '-C', pasta]);
    assert.ok(fs.readFileSync(path.join(pasta, 'IMG_1 (2).HEIC')).equals(arquivos[2].dados), 'o tar do Windows extrai igual');
    assert.ok(fs.readFileSync(path.join(pasta, 'Palestra — São Paulo.JPG')).equals(arquivos[0].dados), 'nome com acento e travessão');
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('juntador: parte que falha 3 vezes derruba o zip; falha passageira é repetida', async () => {
  const { juntadorDePartes } = await import('../api/_zip.js');
  let tentativas = 0;
  const ok = juntadorDePartes({ tamanhoParte: 4, enviar: async () => { if (++tentativas === 1) throw new Error('oscilou'); return 'e'; } });
  await ok.escrever(new Uint8Array(10));
  assert.equal((await ok.terminar()).length, 3, '10 bytes em blocos de 4 = 3 partes (a 1ª repetida)');
  const ruim = juntadorDePartes({ tamanhoParte: 4, enviar: async () => { throw new Error('R2 recusou'); } });
  await assert.rejects(async () => { await ruim.escrever(new Uint8Array(4)); await ruim.terminar(); }, /R2 recusou/);
});

test('senha do link: só o hash scrypt vai ao banco; a prova bate com a senha certa e com nenhuma outra', async () => {
  const { hashDaSenha, provaDaSenha } = await import('../api/_senha.js');
  const h = await hashDaSenha('senha certa');
  const m = /^(scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(h);
  assert.ok(m, h);
  assert.ok(!h.includes('senha certa'));
  assert.equal(await provaDaSenha('senha certa', m[1]), m[2]);
  assert.notEqual(await provaDaSenha('senha errada', m[1]), m[2]);
  assert.equal(await provaDaSenha('x', 'scrypt$1048576$8$1$AAAAAAAAAAAAAAAAAAAAAA'), null, 'custo diferente do deste sistema: não calcula');
  assert.equal(await provaDaSenha('x', 'qualquer coisa'), null);
  assert.notEqual(await hashDaSenha('senha certa'), h, 'sal novo a cada link');
});

test('download: link assinado com o nome original (Content-Disposition), 1 h para começar', async () => {
  const r2 = await import('../api/_r2.js');
  const antes = { ...process.env };
  Object.assign(process.env, { R2_CONTA: 'a'.repeat(32), R2_CHAVE_ID: 'id-de-teste', R2_CHAVE_SEGREDO: 'segredo-de-teste', R2_BUCKET: 'importek-biblioteca-teste' });
  try {
    const u = new URL(await r2.linkDeDownload('originais/2026/x.jpg', 'Palestra de abertura (São Paulo).JPG'));
    assert.equal(u.pathname, '/importek-biblioteca-teste/originais/2026/x.jpg');
    assert.equal(u.searchParams.get('X-Amz-Expires'), '3600');
    assert.equal(u.searchParams.get('response-content-disposition'),
      "attachment;filename*=UTF-8''Palestra%20de%20abertura%20%28S%C3%A3o%20Paulo%29.JPG");
    assert.match(u.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  } finally {
    for (const k of ['R2_CONTA', 'R2_CHAVE_ID', 'R2_CHAVE_SEGREDO', 'R2_BUCKET']) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
  }
});

test('zips, links e baixar: sem cookie respondem 401; a rotina só com o CRON_SECRET', async () => {
  const zips = (await import('../api/zips.js')).default;
  const links = (await import('../api/links.js')).default;
  const json = { 'content-type': 'application/json' };
  const casos = [
    [zips, { method: 'GET', url: '/api/zips', headers: {} }],
    [zips, { method: 'GET', url: '/api/zips?baixar=x&parte=1', headers: {} }],
    [zips, { method: 'POST', url: '/api/zips', headers: json, body: { acao: 'pedir', ids: [crypto.randomUUID()] } }],
    [links, { method: 'GET', url: '/api/links', headers: {} }],
    [links, { method: 'POST', url: '/api/links', headers: json, body: { acao: 'revogar', id: crypto.randomUUID() } }],
    [arquivos, { method: 'GET', url: `/api/arquivos?baixar=${crypto.randomUUID()}`, headers: {} }],
  ];
  for (const [fn, req] of casos) {
    const res = resposta();
    await fn(req, res);
    assert.equal(res.codigo, 401, `${req.method} ${req.url} ${req.body?.acao ?? ''}`);
  }
  let res = resposta();
  await zips({ method: 'POST', url: '/api/zips', headers: { ...json, authorization: 'Bearer errado' }, body: { acao: 'gerar', id: crypto.randomUUID() } }, res);
  assert.equal(res.codigo, 401, 'rotina sem o segredo certo');
  res = resposta();
  await zips({ method: 'POST', url: '/api/zips', headers: json, body: { acao: 'apagar' } }, res);
  assert.equal(res.codigo, 400);
});

test('link externo (visitante): sem código no formato certo, 404 sem chegar ao banco; só POST com JSON', async () => {
  const externo = (await import('../api/externo.js')).default;
  const json = { 'content-type': 'application/json' };
  let res = resposta();
  await externo({ method: 'GET', url: '/api/externo', headers: {} }, res);
  assert.equal(res.codigo, 405);
  res = resposta();
  await externo({ method: 'POST', url: '/api/externo', headers: { 'content-type': 'text/plain' }, body: 'x' }, res);
  assert.equal(res.codigo, 415);
  for (const codigo of [undefined, '', 'curto', 'x'.repeat(43) + '!', 'a'.repeat(44)]) {
    res = resposta();
    await externo({ method: 'POST', url: '/api/externo', headers: json, body: { acao: 'abrir', codigo } }, res);
    assert.equal(res.codigo, 404, String(codigo));
    assert.equal(res.corpo.situacao, 'nao_encontrado');
  }
  res = resposta();
  await externo({ method: 'POST', url: '/api/externo', headers: json, body: { acao: 'apagar', codigo: 'a'.repeat(43) } }, res);
  assert.equal(res.codigo, 400);
  const { enderecoDoLink } = await import('../api/links.js');
  const antes = process.env.PORTAL_URL;
  process.env.PORTAL_URL = 'https://portal-importek.vercel.app/';
  try {
    assert.equal(enderecoDoLink('A'.repeat(43)), `https://portal-importek.vercel.app/biblioteca/l#${'A'.repeat(43)}`, 'endereço do Portal, código depois do #');
  } finally {
    if (antes === undefined) delete process.env.PORTAL_URL; else process.env.PORTAL_URL = antes;
  }
});

// ── Fase 5: controle (lixeira, uso, log) ─────────────────────────────────────────────────────────────────
test('controle: sem cookie, 401 em toda rota (nem chega ao banco ou ao R2); rota e ação desconhecidas', async () => {
  const controle = (await import('../api/controle.js')).default;
  const json = { 'content-type': 'application/json' };
  for (const url of ['/api/controle?rota=lixeira', '/api/controle?rota=uso', '/api/controle?rota=log', '/api/controle?rota=log&csv=1']) {
    const res = resposta();
    await controle({ method: 'GET', url, headers: {} }, res);
    assert.equal(res.codigo, 401, url);
  }
  for (const acao of ['restaurar', 'apagar', 'apagar_evento', 'medir_uso', 'config']) {
    const res = resposta();
    await controle({ method: 'POST', url: '/api/controle', headers: json, body: { acao, ids: [crypto.randomUUID()], id: crypto.randomUUID() } }, res);
    assert.equal(res.codigo, 401, acao);
  }
  let res = resposta();
  await controle({ method: 'GET', url: '/api/controle?rota=outra', headers: {} }, res);
  assert.equal(res.codigo, 404);
  res = resposta();
  await controle({ method: 'POST', url: '/api/controle', headers: json, body: { acao: 'apagar_tudo' } }, res);
  assert.equal(res.codigo, 400);
});

test('rotina: apaga do banco só os arquivos cujos objetos TODOS saíram do R2', async () => {
  const { apagarDoR2 } = await import('../api/_rotina.js');
  // Sem R2 configurado, nenhum objeto sai: nada pode sair do banco.
  const ids = await apagarDoR2([{ id: 'a', chave_original: 'originais/2026/a.jpg', chave_miniatura: 'miniaturas/2026/a.jpg' }]);
  assert.deepEqual(ids, []);
});
