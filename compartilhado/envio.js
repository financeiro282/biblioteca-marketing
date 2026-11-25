// Envio de arquivos (Fase 2) — as regras que a tela, a API e o modo demonstração usam juntas.
//
// O arquivo vai do NAVEGADOR direto ao R2 (bucket privado), por links assinados de poucos minutos que o servidor
// gera. Nunca passa pela Vercel (limite de 4,5 MB por pedido).
//   • até 32 MB: um envio só (PUT);
//   • acima: em partes (multipart). O R2 exige partes do MESMO tamanho (menos a última), de 5 MiB a 5 GiB, e no
//     máximo 10.000 partes. A parte é de 16 MiB, ou maior quando o arquivo passa de ~156 GiB.
// Duplicado = mesmo SHA-256 (impressão digital do conteúdo, calculada no navegador antes de enviar).
// Chaves no R2: originais/<ano do evento>/<id>.<ext>, miniaturas/…/<id>.jpg, previas/…/<id>.jpg — nunca o nome
// que veio do usuário (o nome original fica só no banco).

import { CODIGOS_DIREITO } from './direito.js';
import { ehUuid } from './busca.js';
import { formatoDoArquivo } from './formatos.js';

const MiB = 1024 * 1024;
export const LIMITE_SIMPLES = 32 * MiB;       // até aqui, um PUT só
export const PARTE_MINIMA = 16 * MiB;
export const MAX_PARTES = 10_000;
export const TAMANHO_MAXIMO = 100 * 1024 * MiB; // 100 GiB por arquivo
export const MINIATURA_PX = 320;
export const PREVIA_PX = 2048;
export const VALIDADE_LINK_ENVIO_SEG = 15 * 60; // links de envio: 15 min (pedidos de novo se vencerem)
export const PARTES_POR_PEDIDO = 20;            // quantos links de parte o servidor assina de uma vez

/** Tamanho da parte (bytes) para um arquivo: 16 MiB, ou o necessário para caber em 10.000 partes (em MiB inteiros). */
export function tamanhoDaParte(tamanho) {
  const precisa = Math.ceil(tamanho / MAX_PARTES / MiB) * MiB;
  return Math.max(PARTE_MINIMA, precisa);
}

/** Como enviar: { modo: 'simples' } ou { modo: 'partes', parte_bytes, total_partes }. */
export function planoDeEnvio(tamanho) {
  if (tamanho <= LIMITE_SIMPLES) return { modo: 'simples', parte_bytes: null, total_partes: 1 };
  const parte = tamanhoDaParte(tamanho);
  return { modo: 'partes', parte_bytes: parte, total_partes: Math.ceil(tamanho / parte) };
}

/** Início e fim (exclusivo) da parte n (1, 2, …) — o mesmo corte no navegador e na conferência. */
export function faixaDaParte(n, parteBytes, tamanho) {
  const inicio = (n - 1) * parteBytes;
  return { inicio, fim: Math.min(inicio + parteBytes, tamanho) };
}

export const chaveOriginal = (ano, id, ext) => `originais/${ano}/${id}.${ext}`;
export const chaveMiniatura = (ano, id) => `miniaturas/${ano}/${id}.jpg`;
export const chavePrevia = (ano, id) => `previas/${ano}/${id}.jpg`;
/** O ano que vai na chave: o da data do evento (aaaa-mm-dd). */
export const anoDaChave = (dataEvento) => String(dataEvento || '').slice(0, 4);

const SHA = /^[0-9a-f]{64}$/;
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Pedido de início de envio (o que o navegador manda): confere tudo antes de falar com o banco ou com o R2.
 * Devolve { valores } ou { erro } (frase para a pessoa).
 * @param {any} e
 * @returns {{ erro: string, valores?: undefined } | { erro?: undefined, valores: { evento_id: string, nome_original: string,
 *   extensao: string, tipo: 'foto' | 'video' | 'raw', mime: string, tamanho_bytes: number, sha256: string, direito_uso: string,
 *   autor: string | null } }}
 */
export function lerInicio(e) {
  const x = e && typeof e === 'object' ? e : {};
  if (!ehUuid(x.evento_id)) return { erro: 'Escolha o evento.' };
  const nome = texto(x.nome, 300);
  const f = formatoDoArquivo(nome);
  if (!f) return { erro: 'Formato não aceito. Aceitos: JPG, PNG, HEIC, MP4, MOV e RAW (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2).' };
  const tamanho = Number(x.tamanho);
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0) return { erro: 'Arquivo vazio.' };
  if (tamanho > TAMANHO_MAXIMO) return { erro: 'Arquivo maior que 100 GB.' };
  const sha256 = String(x.sha256 ?? '').toLowerCase();
  if (!SHA.test(sha256)) return { erro: 'Pedido inválido.' };
  // Direito do ARQUIVO: "liberado" = sem restrição a mais (vale o do evento); interno e sem autorização restringem.
  const direito_uso = x.direito_uso === undefined || x.direito_uso === null ? 'liberado' : String(x.direito_uso);
  if (!CODIGOS_DIREITO.includes(direito_uso)) return { erro: 'Direito de uso inválido.' };
  return {
    valores: {
      evento_id: String(x.evento_id).toLowerCase(), nome_original: nome, extensao: f.extensao, tipo: /** @type {any} */ (f.tipo),
      mime: f.mime, tamanho_bytes: tamanho, sha256, direito_uso, autor: texto(x.autor, 200) || null,
    },
  };
}

const inteiroPositivo = (v, max) => (Number.isInteger(v) && v > 0 && v <= max ? v : null);

/**
 * Dados lidos do arquivo no navegador (EXIF, vídeo). Tudo opcional: o que vier estranho é ignorado (não impede
 * o envio). A data de captura só vale entre 1990 e amanhã.
 * @param {any} m
 */
export function lerMetadados(m, agora = Date.now()) {
  const x = m && typeof m === 'object' ? m : {};
  const d = x.capturado_em ? new Date(x.capturado_em) : null;
  const dataOk = d && !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1990 && d.getTime() <= agora + 86_400_000;
  const duracao = Number(x.duracao_seg);
  return {
    largura: inteiroPositivo(x.largura, 100_000),
    altura: inteiroPositivo(x.altura, 100_000),
    duracao_seg: Number.isFinite(duracao) && duracao >= 0 && duracao < 1e7 ? Math.round(duracao * 1000) / 1000 : null,
    capturado_em: dataOk ? d.toISOString() : null,
    camera: texto(x.camera, 200) || null,
  };
}

/** Partes informadas no fim do envio em partes: [{ numero, etag }] em ordem, sem buraco. */
export function lerPartes(partes, totalPartes) {
  if (!Array.isArray(partes) || partes.length !== totalPartes) return null;
  const lista = partes.map((p) => ({ numero: Number(p?.numero), etag: String(p?.etag ?? '') }))
    .sort((a, b) => a.numero - b.numero);
  const ok = lista.every((p, i) => p.numero === i + 1 && /^"?[0-9A-Za-z-]{1,100}"?$/.test(p.etag));
  return ok ? lista : null;
}
