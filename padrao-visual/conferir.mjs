// Padrão visual Importek · CONFERÊNCIA DA CÓPIA. Roda no projeto que recebeu o padrão:
//   node padrao-visual/conferir.mjs
// Lê `copia.json` (gravado pelo script de cópia do portal) e confere, arquivo por arquivo,
// que a cópia não foi editada. Sai com código 1 se algo mudou ou sumiu.
//
// ⚠️ Mudar o padrão é no portal (portal-importek/padrao-visual/), numa versão nova, e copiar
//    de novo — nunca editando a cópia. Este script existe para isso não acontecer calado.
// Sem dependência: só Node. Não lê nada fora da própria pasta.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = dirname(fileURLToPath(import.meta.url));
const manifesto = join(pasta, 'copia.json');
if (!existsSync(manifesto)) {
  console.log('Sem copia.json: esta é a pasta OFICIAL do padrão (no portal), não uma cópia. Nada a conferir.');
  process.exit(0);
}
const copia = JSON.parse(readFileSync(manifesto, 'utf8'));
const problemas = [];
for (const [nome, esperado] of Object.entries(copia.arquivos || {})) {
  const caminho = join(pasta, nome);
  if (!existsSync(caminho)) { problemas.push(nome + ': sumiu'); continue; }
  const obtido = createHash('sha256').update(readFileSync(caminho)).digest('hex');
  if (obtido !== esperado) problemas.push(nome + ': editado na cópia');
}
if (problemas.length) {
  console.log('FALHA  padrão visual v' + copia.versao + ' — a cópia não confere com a versão oficial:');
  for (const p of problemas) console.log('  - ' + p);
  console.log('Corrija no portal (portal-importek/padrao-visual/) e copie de novo: node scripts/copiar-padrao.mjs "<pasta do projeto>"');
  process.exit(1);
}
console.log('ok  padrão visual v' + copia.versao + ' (' + Object.keys(copia.arquivos).length + ' arquivos, copiado em ' + copia.copiado_em + ')');
