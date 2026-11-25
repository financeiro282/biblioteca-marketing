// Busca e filtros — a MESMA leitura dos filtros na API, na tela e no modo demonstração.
//
// Pedido do Lucas (24/11/2026): busca por nome do evento, tag, data, local e legenda; filtros por tipo
// (foto/vídeo), ano e direito de uso. O banco guarda, em cada evento e arquivo, a coluna `busca` (minúscula e
// sem acento, preenchida por gatilho). Aqui o texto digitado é normalizado do mesmo jeito.

import { CODIGOS_DIREITO } from './direito.js';
import { CODIGOS_TIPO } from './formatos.js';

/** Minúsculo e sem acento (igual à coluna `busca` do banco). */
export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Texto da busca pronto para o filtro: sem acento e sem os caracteres que a API do banco usa como comando. */
export function limparBusca(q) {
  return normalizar(q).replace(/[%_,()*:"'\\.;<>{}[\]|&!=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v) => typeof v === 'string' && UUID.test(v);

/** Data dd/mm/aaaa ou aaaa-mm-dd digitada na busca → aaaa-mm-dd (ou null). */
export function dataDaBusca(q) {
  const s = String(q || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return validarData(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return validarData(+m[1], +m[2], +m[3]);
  return null;
}
function validarData(a, m, d) {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

export const POR_PAGINA = 60;

/**
 * Lê os filtros de uma URLSearchParams (ou objeto). Valor inválido é IGNORADO (não dá erro): a tela nunca quebra
 * por causa de um endereço editado à mão. Devolve só o que vale.
 */
export function lerFiltros(entrada) {
  const p = entrada instanceof URLSearchParams ? entrada : new URLSearchParams(entrada || {});
  const f = {};
  const q = String(p.get('q') || '');
  const data = dataDaBusca(q);
  if (data) f.data = data;
  else if (limparBusca(q)) f.q = limparBusca(q);
  const tipo = p.get('tipo');
  if (CODIGOS_TIPO.includes(tipo)) f.tipo = tipo;
  const direito = p.get('direito');
  if (CODIGOS_DIREITO.includes(direito)) f.direito = direito;
  const ano = Number(p.get('ano'));
  if (Number.isInteger(ano) && ano >= 1990 && ano <= 2100) f.ano = ano;
  if (ehUuid(p.get('evento'))) f.evento = p.get('evento').toLowerCase();
  if (p.get('aprovadas') === '1') f.aprovadas = true;
  if (p.get('favoritos') === '1') f.favoritos = true;
  const pagina = Number(p.get('pagina'));
  f.pagina = Number.isInteger(pagina) && pagina >= 1 && pagina <= 10_000 ? pagina : 1;
  return f;
}

/** O texto bate? Trecho contínuo, como o `ilike '%…%'` do banco (modo demonstração e testes). */
export const bate = (textoNormalizado, q) => !q || textoNormalizado.includes(q);
