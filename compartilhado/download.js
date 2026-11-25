// Download, zip e link externo (Fase 4, 25/11/2026): regras que valem no servidor, na tela e na demonstração.
//
// ZIP EM SEGUNDO PLANO: o servidor lê os originais do R2 e grava o zip de volta no R2 (api/_zipador.js).
//   • Cada PARTE tem até 2 GB: cabe com folga numa rotina da Vercel (5 min) e fica abaixo dos 4 GiB do zip simples
//     (sem ZIP64, que alguns programas antigos não abrem). Pedido maior vira "parte 1 de N".
//   • Arquivo acima de 1 GB (vídeo grande) NÃO entra no zip: baixa direto pela ficha (mesma velocidade, sem esperar).
//   • O zip pronto fica 7 dias (o R2 apaga `zips/` sozinho) e o aviso chega pelo Portal.
// LINK EXTERNO: o código (32 bytes sorteados) vai só no # do endereço — não passa por servidor nem fica em log.
//   O banco guarda só o sha256 dele e confere tudo a cada acesso (SQL 02).

import { ehUuid } from './busca.js';

const GB = 1_000_000_000;
export const LIMITE_PARTE_ZIP = 2 * GB;
export const LIMITE_ARQUIVO_NO_ZIP = 1 * GB;
export const MAX_ARQUIVOS_ZIP = 5000;            // o banco aceita até 5000 por pedido
export const MAX_ARQUIVOS_POR_PARTE = 2000;
export const VALIDADE_ZIP_DIAS = 7;
export const VALIDADE_DOWNLOAD_SEG = 60 * 60;    // link de download: 1 h para COMEÇAR (depois de começar, vai até o fim)
export const ZIPS_ATIVOS_POR_PESSOA = 3;

export const LIMITES_LINK = { titulo: 200, destinatario: 300, mensagem: 2000, senhaMin: 6, senhaMax: 100, arquivos: 1000, dias: 90 };
export const VALIDADES_LINK = [1, 7, 15, 30, 60, 90];

export const chaveDoZip = (zipId, n) => `zips/${zipId}/parte-${n}.zip`;
export const formatoDoCodigo = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);

/**
 * Divide os arquivos (na ordem em que vêm) em partes de até 2 GB; os acima de 1 GB ficam fora.
 * @param {{ id: string, tamanho_bytes: number }[]} arquivos
 */
export function planoDoZip(arquivos) {
  const partes = [];
  const fora = [];
  let atual = null;
  for (const a of arquivos) {
    const t = Number(a.tamanho_bytes) || 0;
    if (t > LIMITE_ARQUIVO_NO_ZIP) { fora.push(a.id); continue; }
    if (!atual || atual.bytes + t > LIMITE_PARTE_ZIP || atual.ids.length >= MAX_ARQUIVOS_POR_PARTE) {
      atual = { n: partes.length + 1, ids: [], bytes: 0, situacao: 'na_fila', tentativas: 0 };
      partes.push(atual);
    }
    atual.ids.push(a.id);
    atual.bytes += t;
  }
  return { partes, fora };
}

const PROIBIDOS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** Nome que todo sistema aceita (Windows inclusive): sem barras nem caracteres proibidos, até 150 letras. */
export function nomeSeguro(nome, reserva = 'arquivo') {
  let s = String(nome ?? '').normalize('NFC').replace(PROIBIDOS, '_').replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
  if (!s) s = reserva;
  if (RESERVADOS.test(s)) s = `_${s}`;
  if (s.length > 150) {
    const ext = /\.[^.\s]{1,10}$/.exec(s)?.[0] ?? '';
    s = s.slice(0, 150 - ext.length).trim() + ext;
  }
  return s;
}

/** Nomes dentro do zip: com uma pasta por evento quando a parte junta mais de um; nome repetido ganha " (2)". */
export function nomesNoZip(arquivos) {
  const variosEventos = new Set(arquivos.map((a) => a.evento)).size > 1;
  const usados = new Set();
  return arquivos.map((a) => {
    const pasta = variosEventos ? `${nomeSeguro(a.evento, 'Evento')}/` : '';
    const base = nomeSeguro(a.nome);
    const ext = /\.[^.\s]{1,10}$/.exec(base)?.[0] ?? '';
    const raiz = ext ? base.slice(0, -ext.length) : base;
    let nome = pasta + base;
    for (let i = 2; usados.has(nome.toLowerCase()); i++) nome = `${pasta}${raiz} (${i})${ext}`;
    usados.add(nome.toLowerCase());
    return nome;
  });
}

/** Nome do arquivo .zip baixado. */
export function nomeDoZip(titulo, n, total) {
  const base = nomeSeguro(titulo, 'Biblioteca de Marketing');
  return total > 1 ? `${base} - parte ${n} de ${total}.zip` : `${base}.zip`;
}

/**
 * Content-Disposition do download (vai no link assinado: o R2 devolve o arquivo com este nome).
 * Só o filename* (UTF-8), sem espaço nem aspas: o valor entra na assinatura do link e precisa sair igual.
 */
export function disposicao(nome) {
  const cod = encodeURIComponent(nomeSeguro(nome)).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment;filename*=UTF-8''${cod}`;
}

/** Pedido de zip: { evento_id } (o evento inteiro) ou { ids } (a seleção). */
export function lerPedidoZip(c) {
  if (c?.evento_id !== undefined && c?.evento_id !== null) {
    const id = String(c.evento_id).toLowerCase();
    return ehUuid(id) ? { evento_id: id } : { erro: 'Evento inválido.' };
  }
  const ids = Array.isArray(c?.ids) ? [...new Set(c.ids.map((x) => String(x).toLowerCase()))] : [];
  if (!ids.length || ids.length > MAX_ARQUIVOS_ZIP || !ids.every(ehUuid)) return { erro: `Escolha de 1 a ${MAX_ARQUIVOS_ZIP} arquivos.` };
  return { ids };
}

/** Situação do zip para a tela ("pronto" vencido = "expirado", mesmo antes da conferência diária). */
export function situacaoDoZip(z, agora = Date.now()) {
  if (z.situacao === 'pronto' && z.expira_em && Date.parse(z.expira_em) <= agora) return 'expirado';
  return z.situacao;
}

/**
 * Zip como a tela recebe. `foraPorId`: nome e tamanho dos arquivos grandes que ficaram fora (baixar direto).
 * @param {any} z linha da tabela zips
 * @param {Map<string, { id: string, nome_original: string, tamanho_bytes: number }>} [foraPorId]
 */
export function zipParaTela(z, foraPorId = new Map(), agora = Date.now()) {
  const partes = Array.isArray(z.partes) ? z.partes : [];
  const noZip = new Set(partes.flatMap((p) => p.ids ?? []));
  const fora = (z.arquivo_ids ?? []).filter((id) => !noZip.has(id)).map((id) => foraPorId.get(id)).filter(Boolean);
  return {
    id: z.id, titulo: z.titulo || 'Arquivos da biblioteca', situacao: situacaoDoZip(z, agora), erro: z.erro ?? null,
    criado_em: z.criado_em, pronto_em: z.pronto_em ?? null, expira_em: z.expira_em ?? null,
    total_arquivos: noZip.size, total_bytes: Number(z.total_bytes) || 0,
    partes: partes.map((p) => ({
      n: p.n, situacao: p.situacao,
      bytes: Number(p.bytes_zip ?? p.bytes) || 0, arquivos: p.arquivos ?? p.ids?.length ?? 0,
    })),
    fora,
  };
}

/** Ids da parte que precisam de uma rotina: na fila, ou travada há mais tempo que a trava (a rotina caiu). */
export function zipPrecisaDeRotina(z, agora = Date.now()) {
  if (!['na_fila', 'gerando'].includes(z.situacao) || !Array.isArray(z.partes)) return false;
  const ativa = z.partes.some((p) => p.situacao === 'gerando' && Date.parse(p.ate) >= agora);
  const livre = z.partes.some((p) => p.situacao === 'na_fila' || (p.situacao === 'gerando' && !(Date.parse(p.ate) >= agora)));
  return livre && !ativa;
}

/**
 * Pedido de link externo (o servidor confere; o banco confere de novo).
 * @returns {{ valores: { titulo: string, destinatario: string|null, mensagem: string|null, dias: number, senha: string|null, ids: string[] } } | { erros: Record<string, string> }}
 */
export function lerLink(e) {
  const erros = {};
  const titulo = String(e?.titulo ?? '').trim();
  const destinatario = String(e?.destinatario ?? '').trim();
  const mensagem = String(e?.mensagem ?? '').trim();
  const senha = typeof e?.senha === 'string' && e.senha !== '' ? e.senha : null;
  const dias = Number(e?.dias);
  if (!titulo) erros.titulo = 'Dê um título ao link (ex.: o nome do evento).';
  else if (titulo.length > LIMITES_LINK.titulo) erros.titulo = `No máximo ${LIMITES_LINK.titulo} caracteres.`;
  if (destinatario.length > LIMITES_LINK.destinatario) erros.destinatario = `No máximo ${LIMITES_LINK.destinatario} caracteres.`;
  if (mensagem.length > LIMITES_LINK.mensagem) erros.mensagem = `No máximo ${LIMITES_LINK.mensagem} caracteres.`;
  if (!Number.isInteger(dias) || dias < 1 || dias > LIMITES_LINK.dias) erros.dias = 'Escolha a validade (de 1 a 90 dias).';
  if (senha !== null && (senha.length < LIMITES_LINK.senhaMin || senha.length > LIMITES_LINK.senhaMax)) {
    erros.senha = `A senha precisa de ${LIMITES_LINK.senhaMin} a ${LIMITES_LINK.senhaMax} caracteres.`;
  }
  const ids = Array.isArray(e?.ids) ? [...new Set(e.ids.map((x) => String(x).toLowerCase()))] : [];
  if (!ids.length || ids.length > LIMITES_LINK.arquivos || !ids.every(ehUuid)) erros.ids = `Escolha de 1 a ${LIMITES_LINK.arquivos} arquivos.`;
  if (Object.keys(erros).length) return { erros };
  return { valores: { titulo, destinatario: destinatario || null, mensagem: mensagem || null, dias, senha, ids } };
}

/** Situação do link para a tela do Marketing. */
export function situacaoDoLink(l, agora = Date.now()) {
  if (l.revogado_em) return 'revogado';
  if (Date.parse(l.expira_em) <= agora) return 'expirado';
  return 'ativo';
}
