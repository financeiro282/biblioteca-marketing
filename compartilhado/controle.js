// Controle (Fase 5, 25/11/2026): lixeira, painel de uso e log. Regras usadas pelo servidor, pela tela e pela
// demonstração.

export const DIAS_LIXEIRA = 30;                 // depois disso, a rotina diária apaga de vez (o banco não aceita menos)
export const LOG_POR_PAGINA = 50;
export const LOG_MAX_CSV = 10_000;

/** Quando o item da lixeira será apagado de vez (excluído há 30 dias). */
export function apagaEm(excluidoEm) {
  const t = Date.parse(excluidoEm);
  return Number.isFinite(t) ? new Date(t + DIAS_LIXEIRA * 86_400_000).toISOString() : null;
}

/** Dias que faltam (0 = apaga na próxima rotina diária). */
export function diasParaApagar(excluidoEm, agora = Date.now()) {
  const fim = Date.parse(apagaEm(excluidoEm) ?? '');
  return Number.isFinite(fim) ? Math.max(0, Math.ceil((fim - agora) / 86_400_000)) : null;
}

/**
 * Custo estimado por mês (US$), com os preços da configuração (1 GB = 10^9 bytes, como as páginas de preço).
 * Principal = R2; cópia = B2 (Fase 6). Não inclui impostos nem IOF.
 * @param {number} bytes
 * @param {{ preco_principal_gb: number|string, gratis_principal_gb: number|string, preco_copia_gb: number|string, gratis_copia_gb: number|string }} c
 */
export function custoMensal(bytes, c) {
  const gb = Math.max(0, Number(bytes) || 0) / 1e9;
  const parte = (preco, gratis) => Math.max(0, gb - Number(gratis || 0)) * Number(preco || 0);
  const principal = parte(c.preco_principal_gb, c.gratis_principal_gb);
  const copia = parte(c.preco_copia_gb, c.gratis_copia_gb);
  const r = (v) => Math.round(v * 100) / 100;
  return { principal: r(principal), copia: r(copia), total: r(principal + copia) };
}

/** Limites de alerta (GB): números inteiros positivos, sem repetir, até 10, em ordem. */
export function lerLimites(v) {
  const lista = (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/)).filter((x) => String(x).trim() !== '').map(Number);
  if (lista.some((n) => !Number.isInteger(n) || n <= 0 || n > 1_000_000)) return null;
  const unicos = [...new Set(lista)].sort((a, b) => a - b);
  return unicos.length <= 10 ? unicos : null;
}

/** Configuração editada pelo Administrador: limites e preços. */
export function lerConfig(e) {
  const erros = {};
  const limites = lerLimites(e?.limites_alerta_gb);
  if (!limites) erros.limites_alerta_gb = 'Use números inteiros em GB, separados por vírgula (até 10). Ex.: 1000, 2000.';
  const valores = { limites_alerta_gb: limites ?? [] };
  for (const k of ['preco_principal_gb', 'gratis_principal_gb', 'preco_copia_gb', 'gratis_copia_gb']) {
    const texto = String(e?.[k] ?? '').trim().replace(',', '.');
    const n = Number(texto);
    if (!texto || !Number.isFinite(n) || n < 0 || n > 100_000) erros[k] = 'Número maior ou igual a zero.';
    else valores[k] = n;
  }
  return Object.keys(erros).length ? { erros } : { valores };
}

/** Nome legível de cada ação do log. */
export const ACOES_DO_LOG = {
  'arquivo.enviar': 'Enviou arquivo',
  'arquivo.alterar': 'Editou arquivo',
  'arquivo.alterar_lote': 'Editou arquivos em lote',
  'arquivo.baixar': 'Baixou original',
  'arquivo.lixeira': 'Mandou arquivo para a lixeira',
  'arquivo.restaurado': 'Restaurou arquivo',
  'arquivo.apagar': 'Apagou arquivo de vez',
  'arquivo.apagar_auto': 'Arquivo apagado de vez (30 dias na lixeira)',
  'evento.criar': 'Criou evento',
  'evento.alterar': 'Editou evento',
  'evento.capa': 'Trocou a capa do evento',
  'evento.lixeira': 'Mandou evento para a lixeira',
  'evento.restaurado': 'Restaurou evento',
  'evento.apagar': 'Apagou evento de vez',
  'evento.apagar_auto': 'Evento apagado de vez (30 dias na lixeira)',
  'zip.pedir': 'Pediu zip',
  'zip.baixar': 'Baixou zip',
  'link.criar': 'Criou link externo',
  'link.revogar': 'Revogou link externo',
  'link.abrir': 'Link externo aberto (visitante)',
  'link.baixar': 'Download pelo link externo (visitante)',
  'link.bloqueado': 'Link bloqueado por senha errada',
  'config.alterar': 'Alterou a configuração (alertas e preços)',
};
export const rotuloDaAcao = (a) => ACOES_DO_LOG[a] ?? a;

/** Filtros do log: ação (ou grupo "arquivo."), pessoa (parte do e-mail ou nome), período (aaaa-mm-dd). */
export function lerFiltrosDoLog(p) {
  const get = (k) => (typeof p?.get === 'function' ? p.get(k) : p?.[k]) ?? '';
  const acao = String(get('acao')).trim();
  const pessoa = String(get('pessoa')).trim().replace(/[%,()*:"'\\;<>{}[\]|&!=]/g, ' ').trim().slice(0, 100);
  const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(String(get('pagina')), 10) || 1));
  return {
    acao: /^[a-z]+(\.[a-z_]+)?\.?$/.test(acao) ? acao : null,
    pessoa: pessoa || null, de: data(get('de')), ate: data(get('ate')), pagina,
  };
}

const HORA_SP = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };

/**
 * CSV do log para abrir no Excel (separador ";", com BOM UTF-8). Célula que começa com = + - @ ganha um apóstrofo
 * (o Excel não trata o texto como fórmula).
 */
export function csvDoLog(linhas) {
  const cel = (v) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ['Data e hora', 'Pessoa', 'E-mail', 'Perfil', 'Ação', 'Código da ação', 'Alvo', 'Id do alvo', 'Detalhes', 'IP'];
  const corpo = linhas.map((l) => [
    new Date(l.em).toLocaleString('pt-BR', HORA_SP).replace(',', ''), l.nome ?? (l.email ? '' : 'Visitante ou rotina'), l.email ?? '',
    l.perfil ?? '', rotuloDaAcao(l.acao), l.acao, l.alvo_tipo ?? '', l.alvo_id ?? '', l.detalhes ?? '', l.ip ?? '',
  ].map(cel).join(';'));
  return `\uFEFF${[cab.join(';'), ...corpo].join('\r\n')}\r\n`;
}
