// /api/zips — zip em segundo plano (Fase 4, 25/11/2026). Todos os perfis (cada um, os seus).
//   GET  /api/zips                       → { zips: [...] } os meus, mais novos primeiro ("Meus downloads")
//   GET  /api/zips?baixar=<id>&parte=<n> → { url } link assinado (1 h para começar) da parte pronta
//   POST /api/zips { acao: 'pedir', evento_id } | { acao: 'pedir', ids: [...] } → { zip, fora }
//   POST /api/zips { acao: 'gerar', id }  ← SÓ o próprio servidor (Authorization: Bearer CRON_SECRET): a rotina
//
// Quem vê o quê: o BANCO (RLS pela sessão) — o pedido só leva o que a pessoa enxerga, e a rotina confere de novo
// (SQL 02). Regras de partes, nomes e validade: compartilhado/download.js. A rotina: api/_zipador.js.

import { waitUntil } from '@vercel/functions';
import { ehUuid } from '../compartilhado/busca.js';
import {
  chaveDoZip, lerPedidoZip, nomeDoZip, planoDoZip, situacaoDoZip, ZIPS_ATIVOS_POR_PESSOA, zipParaTela,
} from '../compartilhado/download.js';
import {
  chamadaDoCron, erro, exigirJson, exigirSessao, lerCorpo, parametros, registrarAcao, responder, responderErro,
} from './_comum.js';
import { linkDeDownload, r2Configurado } from './_r2.js';
import { chamarRotinasDepois, retomarSePreciso, trabalhar } from './_zipador.js';

const naoEncontrado = () => erro(404, 'Zip não encontrado.', 'nao_encontrado');
const COLUNAS = 'id, titulo, situacao, partes, total_bytes, arquivo_ids, erro, criado_em, pronto_em, expira_em';
const ARQ = 'id, evento_id, nome_original, tamanho_bytes, capturado_em, eventos!inner(nome, excluido_em)';

// Lê arquivos pelo RLS de quem pede, em páginas (o banco entrega no máximo 1000 por vez).
async function lerArquivos(sb, filtrar) {
  const todos = [];
  for (let de = 0; de < 10_000; de += 1000) {
    const { data, error } = await filtrar(sb.from('arquivos').select(ARQ))
      .eq('situacao', 'pronto').is('excluido_em', null).is('eventos.excluido_em', null)
      .order('capturado_em', { ascending: true, nullsFirst: false }).order('nome_original').order('id')
      .range(de, de + 999);
    if (error) throw error;
    todos.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return todos;
}

async function lerPorIds(sb, ids) {
  const todos = [];
  for (let i = 0; i < ids.length; i += 150) todos.push(...(await lerArquivos(sb, (q) => q.in('id', ids.slice(i, i + 150)))));
  const ordem = new Map(ids.map((id, i) => [id, i]));
  return todos.sort((a, b) => ordem.get(a.id) - ordem.get(b.id));    // na ordem da tela
}

const foraParaTela = (a) => ({ id: a.id, nome_original: a.nome_original, tamanho_bytes: Number(a.tamanho_bytes) || 0 });

async function pedir(req, corpo) {
  const { sb, eu } = await exigirSessao(req);
  if (!r2Configurado()) throw erro(503, 'O armazenamento dos arquivos ainda não está configurado.', 'sem_r2');
  const pedido = lerPedidoZip(corpo);
  if (pedido.erro) throw erro(400, pedido.erro);
  const email = eu.email.toLowerCase();
  const { count, error: e0 } = await sb.from('zips').select('id', { count: 'exact', head: true })
    .eq('pedido_por_email', email).in('situacao', ['na_fila', 'gerando']);
  if (e0) throw e0;
  if ((count ?? 0) >= ZIPS_ATIVOS_POR_PESSOA) {
    throw erro(429, `Você já tem ${ZIPS_ATIVOS_POR_PESSOA} zips sendo preparados. Espere um deles ficar pronto em "Meus downloads".`, 'muitos_zips');
  }

  let arquivos;
  let titulo;
  if (pedido.evento_id) {
    const { data: ev, error } = await sb.from('eventos').select('id, nome, excluido_em').eq('id', pedido.evento_id).maybeSingle();
    if (error) throw error;
    if (!ev || ev.excluido_em) throw erro(404, 'Evento não encontrado.', 'nao_encontrado');
    arquivos = await lerArquivos(sb, (q) => q.eq('evento_id', ev.id));
    titulo = ev.nome;
  } else {
    arquivos = await lerPorIds(sb, pedido.ids);
    const eventos = new Set(arquivos.map((a) => a.eventos?.nome));
    const qtd = `${arquivos.length} ${arquivos.length === 1 ? 'arquivo' : 'arquivos'}`;
    titulo = eventos.size === 1 ? `${[...eventos][0]} (${qtd})` : `Seleção de ${qtd}`;
  }
  if (!arquivos.length) throw erro(400, 'Nenhum arquivo para baixar.', 'vazio');

  const plano = planoDoZip(arquivos);
  const porId = new Map(arquivos.map((a) => [a.id, a]));
  const fora = plano.fora.map((id) => foraParaTela(porId.get(id)));
  if (!plano.partes.length) return { zip: null, fora };     // só arquivos grandes: baixa cada um direto

  const { data: z, error } = await sb.from('zips').insert({
    pedido_por_email: email, pedido_por_nome: eu.nome, pedido_por_perfil: eu.perfil,
    arquivo_ids: arquivos.map((a) => a.id), partes: plano.partes, titulo: titulo.slice(0, 200),
    total_bytes: plano.partes.reduce((s, p) => s + p.bytes, 0),
  }).select(COLUNAS).single();
  if (error) throw error;
  await registrarAcao(sb, eu, 'zip.pedir', 'zip', z.id, {
    arquivos: arquivos.length - fora.length, partes: plano.partes.length, fora: fora.length,
    ...(pedido.evento_id ? { evento_id: pedido.evento_id } : {}),
  });
  chamarRotinasDepois(z.id, plano.partes.length);
  return { zip: zipParaTela(z, new Map(fora.map((f) => [f.id, f]))), fora };
}

async function listar(req) {
  const { sb, eu } = await exigirSessao(req);
  const { data, error } = await sb.from('zips').select(COLUNAS)
    .eq('pedido_por_email', eu.email.toLowerCase()).order('criado_em', { ascending: false }).limit(30);
  if (error) throw error;
  const zips = data ?? [];
  // Arquivos grandes que ficaram fora (para "baixar direto"): nome e tamanho, pelo RLS.
  const foraIds = [...new Set(zips.flatMap((z) => {
    const noZip = new Set((z.partes ?? []).flatMap((p) => p.ids ?? []));
    return (z.arquivo_ids ?? []).filter((id) => !noZip.has(id));
  }))].slice(0, 300);
  const foraPorId = new Map();
  if (foraIds.length) {
    const { data: fa, error: e2 } = await sb.from('arquivos').select('id, nome_original, tamanho_bytes').in('id', foraIds);
    if (e2) throw e2;
    for (const a of fa ?? []) foraPorId.set(a.id, foraParaTela(a));
  }
  retomarSePreciso(zips);     // rotina que caiu: chama outra (depois da resposta)
  return { zips: zips.map((z) => zipParaTela(z, foraPorId)) };
}

async function baixar(req, p) {
  const { sb, eu } = await exigirSessao(req);
  const id = String(p.get('baixar') || '').toLowerCase();
  const n = Number(p.get('parte') || 1);
  if (!ehUuid(id) || !Number.isInteger(n) || n < 1) throw naoEncontrado();
  const { data: z, error } = await sb.from('zips').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!z) throw naoEncontrado();
  const situacao = situacaoDoZip(z);
  if (situacao === 'expirado') throw erro(410, 'Este zip venceu (cada zip fica 7 dias). Peça de novo.', 'expirado');
  const parte = (z.partes ?? []).find((x) => x.n === n);
  if (situacao !== 'pronto' || parte?.situacao !== 'pronto') throw erro(409, 'Este zip ainda não está pronto.', 'nao_pronto');
  const url = await linkDeDownload(chaveDoZip(id, n), nomeDoZip(z.titulo, n, z.partes.length));
  if (!url) throw erro(503, 'O armazenamento dos arquivos ainda não está configurado.', 'sem_r2');
  await registrarAcao(sb, eu, 'zip.baixar', 'zip', id, { parte: n });
  return { url };
}

function gerar(req, res, corpo) {
  if (!chamadaDoCron(req)) return responder(res, 401, { erro: 'Chamada não autorizada.' });
  const id = String(corpo.id ?? '').toLowerCase();
  if (!ehUuid(id)) return responder(res, 400, { erro: 'Pedido inválido.' });
  const inicio = Date.now();
  waitUntil(trabalhar(id, inicio).catch((e) => console.error(`[zip] ${id} rotina parou:`, e?.message || e)));
  return responder(res, 202, { ok: true });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      exigirJson(req);
      const corpo = await lerCorpo(req);
      if (corpo.acao === 'gerar') return gerar(req, res, corpo);
      if (corpo.acao === 'pedir') return responder(res, 200, await pedir(req, corpo));
      throw erro(400, 'Ação desconhecida.');
    }
    if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não aceito.' });
    const p = parametros(req);
    if (p.get('baixar') !== null) return responder(res, 200, await baixar(req, p));
    return responder(res, 200, await listar(req));
  } catch (e) {
    return responderErro(res, e, 'zips');
  }
}
