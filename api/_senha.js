// Senha do link externo (Fase 4). Só no servidor; a senha nunca é guardada nem vai ao banco.
//
// Guardado no banco: `scrypt$N$r$p$sal$hash` (scrypt do próprio Node, sal de 16 bytes sorteado).
// Para abrir: o banco devolve o "sal" (`scrypt$N$r$p$sal`), o servidor calcula a PROVA (o scrypt da senha digitada)
// e manda só ela; quem compara e conta os erros é o banco (SQL 02, link_conferir).

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, TAMANHO = 32;
const SAL = /^scrypt\$(\d{1,7})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{16,64})$/;

/** A prova da senha para o sal do link. null = sal fora do formato deste sistema (nunca calcula com outro custo). */
export async function provaDaSenha(senha, sal) {
  const m = SAL.exec(String(sal ?? ''));
  if (!m || Number(m[1]) !== N || Number(m[2]) !== R || Number(m[3]) !== P) return null;
  const chave = await scrypt(String(senha ?? '').normalize('NFC'), m[4], TAMANHO, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return Buffer.from(chave).toString('base64url');
}

/** O que vai para o banco quando o link tem senha. */
export async function hashDaSenha(senha) {
  const sal = `scrypt$${N}$${R}$${P}$${crypto.randomBytes(16).toString('base64url')}`;
  return `${sal}$${await provaDaSenha(senha, sal)}`;
}
