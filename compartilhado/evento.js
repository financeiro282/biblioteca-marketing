// Evento (álbum): a MESMA leitura dos campos na tela (avisos no formulário), na API (que grava) e no modo
// demonstração. Os limites são os do banco (CHECK de biblioteca.eventos em importek-sistemas/banco/biblioteca/
// 01-estrutura.sql): mudou lá, muda aqui.
//
// Pedido do Lucas (24/11/2026): nome, data, local, descrição, tags, responsável e capa (a capa entra na Fase 3).
// O direito de uso do evento é escolhido SEMPRE (não há padrão): ninguém libera um evento por descuido.

import { CODIGOS_DIREITO, DIREITOS } from './direito.js';
import { normalizar } from './busca.js';

export const LIMITES = { nome: 200, local: 200, responsavel: 200, descricao: 4000, tag: 40, tags: 50 };

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
// A descrição guarda as quebras de linha (só tira espaços sobrando no começo e no fim).
const textoLongo = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();

/** Data aaaa-mm-dd válida entre 1990 e 2100 (o campo de data do navegador manda nesse formato). */
export function dataValida(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const [a, mes, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return a >= 1990 && a <= 2100 ? m[0] : null;
}

/** Tags: lista ou texto separado por vírgula → sem espaços sobrando, sem repetidas (ignorando acento e maiúscula). */
export function lerTags(v) {
  const lista = Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/);
  const vistas = new Set();
  const tags = [];
  for (const t of lista.map(texto).filter(Boolean)) {
    const chave = normalizar(t);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    tags.push(t);
  }
  return tags;
}

/**
 * Confere e arruma os campos de um evento. Devolve { valores } (pronto para gravar) ou { erros } (campo → frase
 * curta para mostrar embaixo do campo). Campo vazio opcional vira null.
 */
/**
 * @param {any} entrada
 * @returns {{ erros: Record<string, string>, valores?: undefined }
 *   | { erros?: undefined, valores: { nome: string, data_evento: string, local: string | null, descricao: string | null,
 *       tags: string[], responsavel: string | null, direito_uso: string } }}
 */
export function lerEvento(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  /** @type {Record<string, string>} */
  const erros = {};
  const nome = texto(e.nome);
  if (!nome) erros.nome = 'Informe o nome do evento.';
  else if (nome.length > LIMITES.nome) erros.nome = `No máximo ${LIMITES.nome} caracteres.`;

  const data_evento = dataValida(e.data_evento);
  if (!data_evento) erros.data_evento = 'Informe a data do evento (dd/mm/aaaa).';

  const opcional = (campo, valor) => {
    if (valor.length > LIMITES[campo]) erros[campo] = `No máximo ${LIMITES[campo]} caracteres.`;
    return valor || null;
  };
  const local = opcional('local', texto(e.local));
  const responsavel = opcional('responsavel', texto(e.responsavel));
  const descricao = opcional('descricao', textoLongo(e.descricao));

  const tags = lerTags(e.tags);
  if (tags.some((t) => t.length > LIMITES.tag)) erros.tags = `Cada tag com no máximo ${LIMITES.tag} caracteres.`;
  else if (tags.length > LIMITES.tags) erros.tags = `No máximo ${LIMITES.tags} tags.`;

  const direito_uso = CODIGOS_DIREITO.includes(e.direito_uso) ? String(e.direito_uso) : null;
  if (!direito_uso) erros.direito_uso = 'Escolha o direito de uso do evento.';

  if (Object.keys(erros).length || !data_evento || !direito_uso) return { erros };
  return { valores: { nome, data_evento, local, descricao, tags, responsavel, direito_uso } };
}

const NIVEL = Object.fromEntries(DIREITOS.map((d) => [d.codigo, d.nivel]));

/** A troca de direito abre o evento para mais gente? (ex.: "Sem autorização" → "Uso liberado") */
export const direitoFicouMaisAberto = (antes, depois) => (NIVEL[depois] ?? 3) < (NIVEL[antes] ?? 3);

/** Quais campos mudaram (para o log): só os nomes, nunca os valores. */
export function camposAlterados(antes, depois) {
  return Object.keys(depois).filter((k) => JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(depois[k] ?? null));
}
