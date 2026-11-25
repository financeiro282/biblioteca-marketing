// Cloudflare R2 (bucket PRIVADO) — links assinados e o envio em partes. Só no servidor.
//
// As chaves ficam em variáveis de ambiente da Vercel (R2_CONTA, R2_CHAVE_ID, R2_CHAVE_SEGREDO, R2_BUCKET) e nunca
// chegam ao navegador: ele recebe só LINKS ASSINADOS (S3 SigV4, biblioteca aws4fetch — aprovada pelo Lucas em
// 25/11/2026) que valem poucos minutos e servem a UM arquivo e UMA operação. Sem domínio público e sem r2.dev.
// Endereço no formato de caminho: https://<conta>.r2.cloudflarestorage.com/<bucket>/<chave> — é só esse endereço da
// conta que entra no CSP do Portal (nunca *.r2.cloudflarestorage.com).
//
// Links de VER (miniatura, prévia): assinados com a hora arredondada para baixo em janelas de 10 min e validade de
// 20 min. O mesmo link sai igual durante a janela (o navegador reaproveita a imagem que já baixou) e sempre vale
// pelo menos 10 min depois de entregue.
// Sem R2 configurado (Fase 1, demonstração), os links saem null e a tela mostra o quadro neutro.

import { AwsClient } from 'aws4fetch';
import { disposicao, VALIDADE_DOWNLOAD_SEG } from '../compartilhado/download.js';

let cache = null;
function conf() {
  const { R2_CONTA, R2_CHAVE_ID, R2_CHAVE_SEGREDO, R2_BUCKET } = process.env;
  if (!R2_CONTA || !R2_CHAVE_ID || !R2_CHAVE_SEGREDO || !R2_BUCKET) return null;
  const chave = `${R2_CONTA}|${R2_CHAVE_ID}|${R2_BUCKET}`;
  if (cache?.chave === chave) return cache;
  const conta = R2_CONTA.trim().toLowerCase();
  const bucket = R2_BUCKET.trim();
  if (!/^[0-9a-f]{32}$/.test(conta) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    console.error('[r2] R2_CONTA (32 letras e números) ou R2_BUCKET em formato inesperado.');
    return null;
  }
  cache = {
    chave,
    base: `https://${conta}.r2.cloudflarestorage.com/${bucket}`,
    cli: new AwsClient({ accessKeyId: R2_CHAVE_ID.trim(), secretAccessKey: R2_CHAVE_SEGREDO.trim(), service: 's3', region: 'auto' }),
  };
  return cache;
}

/** O R2 está configurado neste servidor? */
export const r2Configurado = () => !!conf();

const urlDe = (base, chave, consulta = {}) => {
  const url = new URL(`${base}/${String(chave).split('/').map(encodeURIComponent).join('/')}`);
  for (const [k, v] of Object.entries(consulta)) url.searchParams.set(k, v === '' ? '' : String(v));
  return url;
};
const dataSigV4 = (seg) => new Date(seg * 1000).toISOString().replace(/[:-]|\.\d{3}/g, '');

/**
 * Link assinado para UMA operação num objeto. `janelaSeg` > 1 = link estável dentro da janela (para ver).
 * @param {string} chave
 * @param {{ metodo?: string, validadeSeg?: number, janelaSeg?: number, consulta?: Record<string, string | number>, agora?: number }} [o]
 */
export async function linkAssinado(chave, { metodo = 'GET', validadeSeg = 1200, janelaSeg = 600, consulta = {}, agora = Date.now() } = {}) {
  const c = conf();
  if (!c || !chave) return null;
  const inicio = Math.floor(agora / 1000 / janelaSeg) * janelaSeg;
  const url = urlDe(c.base, chave, { ...consulta, 'X-Amz-Expires': validadeSeg });
  const r = await c.cli.sign(url.toString(), { method: metodo, aws: { signQuery: true, datetime: dataSigV4(inicio) } });
  return r.url;
}

/** Link assinado da miniatura (320 px). */
export const linkDaMiniatura = (chave) => linkAssinado(chave);
/** Link assinado da prévia (foto grande). */
export const linkDaPrevia = (chave) => linkAssinado(chave);

// ── operações do servidor no R2 (envio em partes) ───────────────────────────────────────────────────────
// Erro do R2 vira um erro com o código dele (ex.: NoSuchUpload) — nunca a resposta inteira na tela.
async function r2(metodo, chave, { consulta = {}, corpo, cabecalhos } = {}) {
  const c = conf();
  if (!c) throw Object.assign(new Error('R2 não configurado.'), { status: 503, codigo: 'sem_r2' });
  const resp = await c.cli.fetch(urlDe(c.base, chave, consulta).toString(), { method: metodo, body: corpo, headers: cabecalhos });
  if (!resp.ok) {
    const t = metodo === 'HEAD' ? '' : await resp.text().catch(() => '');
    const codigo = /<Code>([^<]+)<\/Code>/.exec(t)?.[1] || `http_${resp.status}`;
    throw Object.assign(new Error(`R2 ${metodo} recusou: ${codigo}`), { r2: codigo, statusR2: resp.status });
  }
  return resp;
}
const tag = (xml, nome) => new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml)?.[1] ?? null;

/** Começa um envio em partes. Devolve o UploadId. */
export async function criarEnvioEmPartes(chave, mime) {
  const xml = await (await r2('POST', chave, { consulta: { uploads: '' }, cabecalhos: { 'Content-Type': mime || 'application/octet-stream' } })).text();
  const id = tag(xml, 'UploadId');
  if (!id) throw new Error('R2 não devolveu o UploadId.');
  return id;
}

/** Lê as partes de um ListParts (XML). Exportado para o teste. */
export function lerListaDePartes(xml) {
  const partes = [...String(xml).matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map(([, p]) => ({
    numero: Number(tag(p, 'PartNumber')), etag: (tag(p, 'ETag') || '').replace(/&quot;/g, '"'), tamanho: Number(tag(p, 'Size')),
  }));
  return { partes, truncado: tag(xml, 'IsTruncated') === 'true', proximo: tag(xml, 'NextPartNumberMarker') };
}

/** As partes que já chegaram ao R2 (para retomar). null = esse envio não existe mais (abortado ou vencido). */
export async function partesEnviadas(chave, uploadId) {
  const todas = [];
  let marcador = null;
  try {
    for (let volta = 0; volta < 20; volta++) {
      const consulta = { uploadId, 'max-parts': 1000, ...(marcador ? { 'part-number-marker': marcador } : {}) };
      const lida = lerListaDePartes(await (await r2('GET', chave, { consulta })).text());
      todas.push(...lida.partes);
      if (!lida.truncado || !lida.proximo) break;
      marcador = lida.proximo;
    }
  } catch (e) {
    if (e?.r2 === 'NoSuchUpload') return null;
    throw e;
  }
  return todas;
}

/** O XML do CompleteMultipartUpload. Exportado para o teste. */
export function xmlDeConclusao(partes) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const etag = (e) => (e.startsWith('"') ? e : `"${e}"`);
  return `<CompleteMultipartUpload>${partes.map((p) => `<Part><PartNumber>${p.numero}</PartNumber><ETag>${esc(etag(p.etag))}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
}

/** Junta as partes no objeto final. */
export async function concluirEnvioEmPartes(chave, uploadId, partes) {
  const resp = await r2('POST', chave, { consulta: { uploadId }, corpo: xmlDeConclusao(partes), cabecalhos: { 'Content-Type': 'application/xml' } });
  const xml = await resp.text();
  // O R2 pode responder 200 com <Error> no corpo (como o S3).
  if (/<Error>/.test(xml)) throw Object.assign(new Error(`R2 recusou juntar as partes: ${tag(xml, 'Code')}`), { r2: tag(xml, 'Code') });
}

/** Desiste de um envio em partes (o que já subiu é descartado pelo R2). Envio que já não existe: ok. */
export async function abortarEnvio(chave, uploadId) {
  try { await r2('DELETE', chave, { consulta: { uploadId } }); } catch (e) { if (e?.r2 !== 'NoSuchUpload' && e?.statusR2 !== 404) throw e; }
}

/** Tamanho do objeto no R2 (bytes), ou null se não existe. */
export async function tamanhoDoObjeto(chave) {
  try {
    const r = await r2('HEAD', chave);
    return Number(r.headers.get('content-length'));
  } catch (e) {
    if (e?.statusR2 === 404) return null;
    throw e;
  }
}

// ── Fase 4: download e zip ──────────────────────────────────────────────────────────────────────────────

/**
 * Link assinado de DOWNLOAD: o R2 devolve o arquivo com o nome escolhido (Content-Disposition).
 * Vale 1 h para começar (depois de começar, o download vai até o fim).
 */
export const linkDeDownload = (chave, nome, validadeSeg = VALIDADE_DOWNLOAD_SEG) =>
  linkAssinado(chave, { validadeSeg, janelaSeg: 1, consulta: { 'response-content-disposition': disposicao(nome) } });

/** Os bytes [inicio, fim) de um objeto (GET com Range). Confere o tamanho que chegou. */
export async function lerPedaco(chave, inicio, fim) {
  const resp = await r2('GET', chave, { cabecalhos: { Range: `bytes=${inicio}-${fim - 1}` } });
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength !== fim - inicio) {
    throw Object.assign(new Error(`R2 devolveu ${buf.byteLength} bytes em vez de ${fim - inicio}.`), { r2: 'tamanho' });
  }
  return buf;
}

/** Uma parte de um envio em partes feito PELO SERVIDOR (o zip). Devolve o ETag. */
export async function enviarParteDoServidor(chave, uploadId, numero, corpo) {
  const resp = await r2('PUT', chave, {
    consulta: { partNumber: numero, uploadId }, corpo,
    cabecalhos: { 'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD' },   // o R2 confere o tamanho; poupa um SHA-256 de 16 MiB
  });
  const etag = resp.headers.get('etag');
  if (!etag) throw new Error('R2 não devolveu o ETag da parte.');
  return etag;
}

/** Apaga um objeto (o que já não existe: ok). */
export async function apagarObjeto(chave) {
  try { await r2('DELETE', chave); } catch (e) { if (e?.statusR2 !== 404) throw e; }
}

// ── Fase 5: painel de uso e lixeira ─────────────────────────────────────────────────────────────────────

/** Soma o bucket inteiro (ListObjectsV2, 1000 por vez): o espaço REAL, para conferir com o banco. */
export async function somarBucket(maxVoltas = 500) {
  let bytes = 0;
  let objetos = 0;
  let token = null;
  for (let volta = 0; volta < maxVoltas; volta++) {
    const consulta = { 'list-type': 2, 'max-keys': 1000, ...(token ? { 'continuation-token': token } : {}) };
    const xml = await (await r2('GET', '', { consulta })).text();
    for (const [, tam] of xml.matchAll(/<Size>(\d+)<\/Size>/g)) { bytes += Number(tam); objetos++; }
    token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : null;
    if (!token) return { bytes, objetos };
  }
  throw new Error('Bucket grande demais para somar numa rotina.');
}

/** Apaga vários objetos (10 ao mesmo tempo). Devolve as chaves que NÃO saíram (vazio = todas saíram). */
export async function apagarObjetos(chaves, simultaneos = 10) {
  const falharam = [];
  const fila = [...new Set(chaves.filter(Boolean))];
  await Promise.all(Array.from({ length: simultaneos }, async () => {
    for (let c = fila.shift(); c !== undefined; c = fila.shift()) {
      try { await apagarObjeto(c); } catch { falharam.push(c); }
    }
  }));
  return falharam;
}
