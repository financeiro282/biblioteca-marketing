// /api/controle — Fase 5 (25/11/2026): lixeira, painel de uso, log e configuração. Uma função só (Hobby: 12 no máximo).
//   GET  ?rota=lixeira                    → { eventos, arquivos }           (Administrador — permissão `lixeira`)
//   GET  ?rota=uso                        → painel                          (Marketing e Administrador — `ver_uso`)
//   GET  ?rota=log&acao&pessoa&de&ate&pagina → { linhas, total }           (Administrador — `relatorios`)
//   GET  ?rota=log&csv=1&…                → arquivo .csv (até 10.000 linhas)
//   POST { acao: 'restaurar', ids } · { acao: 'restaurar_evento', id }      (`lixeira`, funções do SQL 01)
//   POST { acao: 'apagar', ids } · { acao: 'apagar_evento', id }            (`lixeira`): PRIMEIRO o R2, DEPOIS o banco (SQL 03)
//   POST { acao: 'medir_uso' }                                             (`configurar`): mede agora, sem esperar a rotina
//   POST { acao: 'config', limites_alerta_gb, preco_*, gratis_* }          (`configurar`)
// Quem vê o quê: o BANCO (RLS pela sessão: só o Administrador enxerga a lixeira e o log). Aqui também se confere a
// permissão (exigirPermissao), como em toda rota.

import { ehUuid } from '../compartilhado/busca.js';
import {
  apagaEm, csvDoLog, custoMensal, LOG_MAX_CSV, LOG_POR_PAGINA, lerConfig, lerFiltrosDoLog,
} from '../compartilhado/controle.js';
import { lerIds } from '../compartilhado/arquivo.js';
import {
  erro, exigirJson, exigirPermissao, lerCorpo, parametros, registrarAcao, responder, responderErro,
} from './_comum.js';
import { linkDaMiniatura } from './_r2.js';
import { apagarDoR2, medirUso } from './_rotina.js';

const naLixeira = (a, eventosNaLixeira) => !!a.excluido_em || eventosNaLixeira.has(a.evento_id);
const ARQ = 'id, evento_id, tipo, nome_original, extensao, tamanho_bytes, chave_original, chave_miniatura, chave_previa, excluido_em, excluido_por_nome';

// ── Lixeira ─────────────────────────────────────────────────────────────────
async function lixeira(req) {
  const { sb } = await exigirPermissao(req, 'lixeira');
  const { data: evs, error: e1 } = await sb.from('eventos').select('id, nome, data_evento, excluido_em, excluido_por_nome')
    .not('excluido_em', 'is', null).order('excluido_em', { ascending: false }).limit(200);
  if (e1) throw e1;
  const eventos = await Promise.all((evs ?? []).map(async (e) => {
    let arquivos = 0;
    let bytes = 0;
    for (let de = 0; de < 20_000; de += 1000) {          // o banco entrega no máximo 1000 por vez
      const { data, error } = await sb.from('arquivos').select('tamanho_bytes').eq('evento_id', e.id).order('id').range(de, de + 999);
      if (error) throw error;
      arquivos += data?.length ?? 0;
      bytes += (data ?? []).reduce((t, a) => t + Number(a.tamanho_bytes), 0);
      if ((data ?? []).length < 1000) break;
    }
    return { ...e, apaga_em: apagaEm(e.excluido_em), arquivos, bytes };
  }));
  const naLixeiraEv = new Set(eventos.map((e) => e.id));
  const { data: arqs, error: e2 } = await sb.from('arquivos').select(ARQ)
    .not('excluido_em', 'is', null).order('excluido_em', { ascending: false }).limit(1000);
  if (e2) throw e2;
  const soltos = (arqs ?? []).filter((a) => !naLixeiraEv.has(a.evento_id));   // os do evento na lixeira aparecem no evento
  const idsEv = [...new Set(soltos.map((a) => a.evento_id))];
  const nomes = new Map();
  if (idsEv.length) {
    const { data, error } = await sb.from('eventos').select('id, nome').in('id', idsEv.slice(0, 300));
    if (error) throw error;
    for (const e of data ?? []) nomes.set(e.id, e.nome);
  }
  return {
    eventos,
    arquivos: await Promise.all(soltos.map(async (a) => ({
      id: a.id, evento_id: a.evento_id, evento_nome: nomes.get(a.evento_id) ?? '', tipo: a.tipo, nome_original: a.nome_original,
      extensao: a.extensao, tamanho_bytes: Number(a.tamanho_bytes) || 0, excluido_em: a.excluido_em,
      excluido_por_nome: a.excluido_por_nome, apaga_em: apagaEm(a.excluido_em), miniatura_url: await linkDaMiniatura(a.chave_miniatura),
    }))),
  };
}

async function restaurar(req, corpo) {
  const { sb } = await exigirPermissao(req, 'lixeira');
  const ids = lerIds(corpo.ids);
  if (!ids) throw erro(400, 'Escolha de 1 a 500 arquivos.');
  const { data, error } = await sb.rpc('arquivos_restaurar', { p_ids: ids });
  if (error) throw error;
  return { restaurados: Number(data) || 0 };
}

async function restaurarEvento(req, corpo) {
  const { sb } = await exigirPermissao(req, 'lixeira');
  const id = String(corpo.id ?? '').toLowerCase();
  if (!ehUuid(id)) throw erro(400, 'Pedido inválido.');
  const { data, error } = await sb.rpc('evento_restaurar', { p_id: id });
  if (error) throw error;
  if (!data) throw erro(404, 'Evento não está na lixeira.', 'nao_encontrado');
  return { ok: true };
}

// Apagar de vez: só o que está na lixeira. R2 primeiro; sai do banco só o que saiu do R2.
async function apagarArquivos(sb, ids, eventosNaLixeira) {
  const { data, error } = await sb.from('arquivos').select(ARQ).in('id', ids);
  if (error) throw error;
  const alvo = (data ?? []).filter((a) => naLixeira(a, eventosNaLixeira));
  if (!alvo.length) return { apagados: 0, falharam: 0 };
  const prontos = await apagarDoR2(alvo);
  let apagados = 0;
  if (prontos.length) {
    const { data: n, error: e2 } = await sb.rpc('lixeira_apagar_arquivos', { p_ids: prontos });
    if (e2) throw e2;
    apagados = Number(n) || 0;
  }
  return { apagados, falharam: alvo.length - prontos.length };
}

async function eventosNaLixeira(sb, ids) {
  if (!ids.length) return new Set();
  const { data, error } = await sb.from('eventos').select('id').in('id', ids).not('excluido_em', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map((e) => e.id));
}

async function apagar(req, corpo) {
  const { sb } = await exigirPermissao(req, 'lixeira');
  const ids = lerIds(corpo.ids);
  if (!ids) throw erro(400, 'Escolha de 1 a 500 arquivos.');
  const { data, error } = await sb.from('arquivos').select('evento_id').in('id', ids);
  if (error) throw error;
  const r = await apagarArquivos(sb, ids, await eventosNaLixeira(sb, [...new Set((data ?? []).map((a) => a.evento_id))]));
  if (r.falharam) throw erro(502, `${r.apagados} apagados; ${r.falharam} não saíram do armazenamento e continuam na lixeira. Tente de novo.`, 'r2');
  return r;
}

async function apagarEvento(req, corpo) {
  const { sb } = await exigirPermissao(req, 'lixeira');
  const id = String(corpo.id ?? '').toLowerCase();
  if (!ehUuid(id)) throw erro(400, 'Pedido inválido.');
  const naLix = await eventosNaLixeira(sb, [id]);
  if (!naLix.has(id)) throw erro(404, 'Evento não está na lixeira.', 'nao_encontrado');
  let apagados = 0;
  for (let volta = 0; volta < 20; volta++) {
    const { data, error } = await sb.from('arquivos').select('id').eq('evento_id', id).limit(500);
    if (error) throw error;
    if (!data?.length) break;
    const r = await apagarArquivos(sb, data.map((a) => a.id), naLix);
    apagados += r.apagados;
    if (r.falharam) throw erro(502, `${apagados} arquivos apagados; alguns não saíram do armazenamento. O evento continua na lixeira: tente de novo.`, 'r2');
  }
  const { data: ok, error } = await sb.rpc('lixeira_apagar_evento', { p_id: id });
  if (error) throw error;
  if (!ok) throw erro(409, `${apagados} arquivos apagados, mas o evento ainda tem arquivos. Tente de novo.`, 'sobrou');
  return { apagado: true, arquivos: apagados };
}

// ── Painel de uso ───────────────────────────────────────────────────────────
async function uso(req) {
  const { sb, eu } = await exigirPermissao(req, 'ver_uso');
  const [dias, alertas, config, porMes, eventos] = await Promise.all([
    sb.from('uso_diario').select('*').order('dia', { ascending: false }).limit(60),
    sb.from('alertas_uso').select('*').order('limite_gb'),
    sb.from('config').select('*').maybeSingle(),
    sb.rpc('uso_por_mes'),
    sb.rpc('buscar_eventos'),
  ]);
  for (const r of [dias, alertas, config, porMes, eventos]) if (r.error) throw r.error;
  const hoje = dias.data?.[0] ?? null;
  const total = hoje ? Number(hoje.bytes_r2 ?? hoje.bytes_banco) : 0;
  const c = config.data;
  return {
    hoje: hoje && {
      dia: hoje.dia, bytes_banco: Number(hoje.bytes_banco), arquivos_banco: hoje.arquivos_banco, bytes_lixeira: Number(hoje.bytes_lixeira),
      bytes_r2: hoje.bytes_r2 === null ? null : Number(hoje.bytes_r2), objetos_r2: hoje.objetos_r2, por_tipo: hoje.por_tipo,
      registrado_em: hoje.registrado_em,
    },
    historico: (dias.data ?? []).map((d) => ({ dia: d.dia, bytes: Number(d.bytes_r2 ?? d.bytes_banco) })).reverse(),
    por_mes: (porMes.data ?? []).map((m) => ({ mes: m.mes, arquivos: Number(m.arquivos), bytes: Number(m.bytes) })),
    maiores: (eventos.data ?? []).map((e) => ({ id: e.id, nome: e.nome, data_evento: e.data_evento, arquivos: Number(e.total_arquivos), bytes: Number(e.total_bytes) }))
      .sort((a, b) => b.bytes - a.bytes).slice(0, 15),
    alertas: (alertas.data ?? []).map((a) => ({ limite_gb: a.limite_gb, avisado_em: a.avisado_em })),
    config: c && {
      limites_alerta_gb: c.limites_alerta_gb, preco_principal_gb: Number(c.preco_principal_gb), gratis_principal_gb: Number(c.gratis_principal_gb),
      preco_copia_gb: Number(c.preco_copia_gb), gratis_copia_gb: Number(c.gratis_copia_gb), atualizado_em: c.atualizado_em, atualizado_por_nome: c.atualizado_por_nome,
    },
    custo: c ? custoMensal(total, c) : null,
    pode_configurar: eu.perfil === 'admin',
  };
}

async function medir(req) {
  await exigirPermissao(req, 'configurar');
  const r = await medirUso();
  return { ok: true, bytes_total: Number(r?.bytes_total) || 0 };
}

async function configurar(req, corpo) {
  const { sb, eu } = await exigirPermissao(req, 'configurar');
  const r = lerConfig(corpo);
  if (r.erros) throw Object.assign(erro(400, 'Confira os campos marcados.', 'campos'), { erros: r.erros });
  const { data, error } = await sb.from('config').update({
    ...r.valores, atualizado_em: new Date().toISOString(), atualizado_por_email: eu.email, atualizado_por_nome: eu.nome,
  }).eq('id', true).select('id');
  if (error) throw error;
  if (!data?.length) throw erro(403, 'Só o Administrador altera a configuração.', 'sem_permissao');
  await registrarAcao(sb, eu, 'config.alterar', 'config', null, r.valores);
  return { ok: true };
}

// ── Log ─────────────────────────────────────────────────────────────────────
function filtrarLog(q, f) {
  if (f.acao) q = f.acao.endsWith('.') ? q.like('acao', `${f.acao}%`) : q.eq('acao', f.acao);
  if (f.pessoa) q = q.or(`email.ilike.%${f.pessoa}%,nome.ilike.%${f.pessoa}%`);
  if (f.de) q = q.gte('em', `${f.de}T00:00:00-03:00`);
  if (f.ate) q = q.lte('em', `${f.ate}T23:59:59.999-03:00`);
  return q;
}

async function log(req, res, p) {
  const { sb } = await exigirPermissao(req, 'relatorios');
  const f = lerFiltrosDoLog(p);
  if (p.get('csv')) {
    const linhas = [];
    for (let de = 0; de < LOG_MAX_CSV; de += 1000) {
      const { data, error } = await filtrarLog(sb.from('log_acoes').select('*'), f).order('em', { ascending: false }).range(de, de + 999);
      if (error) throw error;
      linhas.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="log-biblioteca-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csvDoLog(linhas));
  }
  const { data, error, count } = await filtrarLog(sb.from('log_acoes').select('*', { count: 'exact' }), f)
    .order('em', { ascending: false }).range((f.pagina - 1) * LOG_POR_PAGINA, f.pagina * LOG_POR_PAGINA - 1);
  if (error) throw error;
  return responder(res, 200, { linhas: data ?? [], total: count ?? 0, pagina: f.pagina, por_pagina: LOG_POR_PAGINA });
}

const ACOES = { restaurar, restaurar_evento: restaurarEvento, apagar, apagar_evento: apagarEvento, medir_uso: medir, config: configurar };

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      exigirJson(req);
      const corpo = await lerCorpo(req);
      const acao = ACOES[corpo.acao];
      if (!acao) throw erro(400, 'Ação desconhecida.');
      return responder(res, 200, await acao(req, corpo));
    }
    if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não aceito.' });
    const p = parametros(req);
    const rota = p.get('rota');
    if (rota === 'lixeira') return responder(res, 200, await lixeira(req));
    if (rota === 'uso') return responder(res, 200, await uso(req));
    if (rota === 'log') return await log(req, res, p);
    return responder(res, 404, { erro: 'Rota desconhecida.' });
  } catch (e) {
    if (e?.erros) return responder(res, e.status, { erro: e.message, codigo: e.codigo, erros: e.erros });
    return responderErro(res, e, 'controle');
  }
}
