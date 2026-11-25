// Organização dos ARQUIVOS (Fase 3) — a mesma leitura na tela, na API e no modo demonstração. Limites = os CHECK de
// biblioteca.arquivos (importek-sistemas/banco/biblioteca/01-estrutura.sql): mudou lá, muda aqui.
//
// Pedido do Lucas (24/11/2026): legenda, autor, tags e direito de uso por arquivo; "Aprovadas para uso" marcadas pelo
// Marketing; favoritos de cada pessoa; lixeira de 30 dias.
//   • Direito do ARQUIVO: "liberado" = sem restrição a mais (vale o do evento). Vale sempre o mais restritivo.
//   • Aprovar: não vale para o que, no fim, está "Sem autorização" (aprovado para uso e proibido ao mesmo tempo).
//   • Em lote: até 500 arquivos de uma vez; só muda o que foi pedido.

import { CODIGOS_DIREITO } from './direito.js';
import { ehUuid, normalizar } from './busca.js';
import { lerTags } from './evento.js';

export const LIMITES_ARQUIVO = { legenda: 2000, autor: 200, tag: 40, tags: 50 };
export const LOTE_MAXIMO = 500;

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const textoLongo = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();

function conferirTags(tags, erros, campo = 'tags') {
  if (tags.some((t) => t.length > LIMITES_ARQUIVO.tag)) erros[campo] = `Cada tag com no máximo ${LIMITES_ARQUIVO.tag} caracteres.`;
  else if (tags.length > LIMITES_ARQUIVO.tags) erros[campo] = `No máximo ${LIMITES_ARQUIVO.tags} tags.`;
}

/**
 * Edição de UM arquivo: { valores } ou { erros } (campo → frase curta).
 * @param {any} entrada
 * @returns {{ erros: Record<string, string>, valores?: undefined }
 *   | { erros?: undefined, valores: { legenda: string | null, autor: string | null, tags: string[], direito_uso: string } }}
 */
export function lerArquivoEditado(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  /** @type {Record<string, string>} */
  const erros = {};
  const legenda = textoLongo(e.legenda);
  if (legenda.length > LIMITES_ARQUIVO.legenda) erros.legenda = `No máximo ${LIMITES_ARQUIVO.legenda} caracteres.`;
  const autor = texto(e.autor);
  if (autor.length > LIMITES_ARQUIVO.autor) erros.autor = `No máximo ${LIMITES_ARQUIVO.autor} caracteres.`;
  const tags = lerTags(e.tags);
  conferirTags(tags, erros);
  const direito_uso = CODIGOS_DIREITO.includes(e.direito_uso) ? String(e.direito_uso) : null;
  if (!direito_uso) erros.direito_uso = 'Escolha o direito de uso.';
  if (Object.keys(erros).length || !direito_uso) return { erros };
  return { valores: { legenda: legenda || null, autor: autor || null, tags, direito_uso } };
}

/** Lista de ids (uuid, sem repetição, até 500). null = inválida. */
export function lerIds(v) {
  if (!Array.isArray(v) || !v.length || v.length > LOTE_MAXIMO) return null;
  const ids = [...new Set(v.map((x) => String(x).toLowerCase()))];
  return ids.every(ehUuid) ? ids : null;
}

/**
 * Mudança em lote: { ids, mudar } ou { erro }. `mudar` só tem o que foi pedido:
 * direito_uso, autor (texto; vazio = apagar), tags_mais, tags_menos, aprovada (true/false).
 * @param {any} entrada
 * @returns {{ erro: string, ids?: undefined, mudar?: undefined }
 *   | { erro?: undefined, ids: string[], mudar: { direito_uso?: string, autor?: string | null, tags_mais?: string[], tags_menos?: string[], aprovada?: boolean } }}
 */
export function lerLote(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const ids = lerIds(e.ids);
  if (!ids) return { erro: `Escolha de 1 a ${LOTE_MAXIMO} arquivos.` };
  const m = e.mudar && typeof e.mudar === 'object' ? e.mudar : {};
  /** @type {{ direito_uso?: string, autor?: string | null, tags_mais?: string[], tags_menos?: string[], aprovada?: boolean }} */
  const mudar = {};
  if (m.direito_uso !== undefined) {
    if (!CODIGOS_DIREITO.includes(m.direito_uso)) return { erro: 'Direito de uso inválido.' };
    mudar.direito_uso = String(m.direito_uso);
  }
  if (m.autor !== undefined && m.autor !== null) {
    const autor = texto(m.autor);
    if (autor.length > LIMITES_ARQUIVO.autor) return { erro: `Autor com no máximo ${LIMITES_ARQUIVO.autor} caracteres.` };
    mudar.autor = autor || null;
  }
  /** @type {Record<string, string>} */
  const errosTags = {};
  for (const campo of ['tags_mais', 'tags_menos']) {
    if (m[campo] === undefined) continue;
    const tags = lerTags(m[campo]);
    conferirTags(tags, errosTags, campo);
    if (tags.length) mudar[campo] = tags;
  }
  if (Object.keys(errosTags).length) return { erro: Object.values(errosTags)[0] };
  if (typeof m.aprovada === 'boolean') mudar.aprovada = m.aprovada;
  if (!Object.keys(mudar).length) return { erro: 'Nada para mudar.' };
  return { ids, mudar };
}

/** Tags depois de somar e tirar (ignorando acento e maiúscula; a ordem das que ficam é mantida). */
export function tagsDepois(atuais, mais = [], menos = []) {
  const tirar = new Set(menos.map(normalizar));
  return lerTags([...(atuais || []), ...mais]).filter((t) => !tirar.has(normalizar(t)));
}

/** Pode aprovar para uso? Não, se no fim o arquivo está "Sem autorização". */
export const podeAprovar = (direitoEfetivo) => direitoEfetivo !== 'sem_autorizacao';
