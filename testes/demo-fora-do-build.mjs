// PROVA: nada do MODO DEMONSTRAÇÃO entra no build que vai para a Vercel.
// Roda com `npm run test:build` (faz o build e depois procura, arquivo por arquivo de dist/, qualquer
// vestígio da demonstração). Não é parte do `npm test` porque precisa do build feito na hora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const VESTIGIOS = ['MODO DEMONSTRA', '__demo', 'Pessoa Demonstração', 'Pessoa Demonstracao', 'demonstracao@exemplo', 'Imagem fictícia', 'Imagem ficticia', '(exemplo)',
  'biblioteca-modo-demonstracao', 'data-demo-perfil', 'demo-faixa', 'Portal simulado', 'dados-demo', 'plugin-demo'];

const arquivos = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? arquivos(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('dist/ existe e foi feito agora (rodar com npm run test:build)', () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'sem dist/index.html: rode `npm run test:build`');
  assert.ok(Date.now() - fs.statSync(path.join(DIST, 'index.html')).mtimeMs < 10 * 60_000, 'dist/ velho: rode `npm run test:build`');
});

test('nenhum arquivo de dist/ tem vestígio da demonstração', () => {
  const achados = [];
  for (const arq of arquivos(DIST)) {
    const texto = fs.readFileSync(arq).toString('latin1') + fs.readFileSync(arq, 'utf8');
    for (const v of VESTIGIOS) if (texto.includes(v)) achados.push(`${path.relative(DIST, arq)}: "${v}"`);
  }
  assert.deepEqual(achados, []);
});

test('no build, o endereço do Portal é o de verdade (não o simulado)', () => {
  const js = arquivos(DIST).filter((a) => a.endsWith('.js')).map((a) => fs.readFileSync(a, 'utf8')).join('\n');
  assert.ok(js.includes('portal-importek.vercel.app'), 'o endereço real do Portal sumiu do build');
});
