// MODO DEMONSTRAÇÃO — só no `npm run dev` (servidor de desenvolvimento do Vite, na máquina).
//
// • `apply: 'serve'` + carregado com import() só quando o comando é "serve" (vite.config.ts): no `npm run build`
//   este arquivo nem é lido, e nada dele vai para dist/ (testes/demo-fora-do-build.mjs prova).
// • NÃO conecta a banco nem ao R2, NÃO lê variável de ambiente, NÃO usa chave nem token, NÃO chama o Portal:
//   responde o /biblioteca/api com dados fictícios (demo/dados-demo.mjs), desenha imagens fictícias (SVG) e troca o
//   endereço do Portal por uma página local (/__demo/portal) que só imita o Portal.
// • O que cada perfil vê segue compartilhado/visibilidade.js — a MESMA regra das políticas do banco.
// • Põe no topo de toda página a faixa "MODO DEMONSTRAÇÃO — dados fictícios" com a troca de perfil.
// • Desligar (ex.: `vercel dev` com as funções de verdade): BIBLIOTECA_SEM_DEMO=1.
//
// Rota nova numa fase nova → acrescentar em ROTAS (e os dados em dados-demo.mjs) e um caso em testes/demo.test.mjs.

import { bate, ehUuid, lerFiltros, normalizar, POR_PAGINA } from '../compartilhado/busca.js';
import { direitoEfetivo } from '../compartilhado/direito.js';
import { arquivoVisivel, eventoVisivel, paraConsulta } from '../compartilhado/visibilidade.js';
import * as D from './dados-demo.mjs';

export const MARCA = 'MODO DEMONSTRAÇÃO — dados fictícios';
const PORTAL_DEMO = '/__demo/portal';
const BASE = '/biblioteca';
const IMG = `${BASE}/__demo/img`;

export const estado = { perfil: 'marketing', saiu: false };

const POR_EVENTO = new Map(D.EVENTOS.map((e) => [e.id, e]));
const buscaEvento = (e) => normalizar([e.nome, e.local, e.descricao, e.responsavel, ...(e.tags || [])].filter(Boolean).join(' '));
const buscaArquivo = (a) => normalizar([a.nome_original, a.legenda, a.autor, a.camera, ...(a.tags || [])].filter(Boolean).join(' '));
const dataBrasil = (iso) => (iso ? new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10) : null);

// O que o perfil enxerga nas telas de consulta (como buscar_eventos / buscar_arquivos no banco).
const eventosDoPerfil = (perfil) => D.EVENTOS.filter((e) => eventoVisivel(perfil, e) && !e.excluido_em);
const arquivosDoPerfil = (perfil) => D.ARQUIVOS.filter((a) => {
  const ev = POR_EVENTO.get(a.evento_id);
  return arquivoVisivel(perfil, a, ev) && paraConsulta(a, ev);
});

function arquivoParaTela(a, perfil) {
  const ev = POR_EVENTO.get(a.evento_id);
  return {
    id: a.id, evento_id: a.evento_id, evento_nome: ev.nome, evento_data: ev.data_evento,
    tipo: a.tipo, nome_original: a.nome_original, extensao: a.extensao, tamanho_bytes: a.tamanho_bytes,
    largura: a.largura, altura: a.altura, duracao_seg: a.duracao_seg, capturado_em: a.capturado_em,
    camera: a.camera, autor: a.autor, legenda: a.legenda, tags: a.tags,
    direito_arquivo: a.direito_uso, direito_evento: ev.direito_uso, direito_efetivo: direitoEfetivo(ev.direito_uso, a.direito_uso),
    aprovada: a.aprovada, favorito: (D.FAVORITOS[perfil] || []).includes(a.id),
    miniatura_url: a.tem_miniatura ? `${IMG}/${a.id}.svg` : null,
    previa_url: a.tipo === 'foto' ? `${IMG}/${a.id}.svg?tam=g` : null,
  };
}

function listarEventos(perfil, f) {
  const visiveis = arquivosDoPerfil(perfil);
  return eventosDoPerfil(perfil)
    .filter((e) => bate(buscaEvento(e), f.q) && (!f.data || e.data_evento === f.data)
      && (!f.ano || Number(e.data_evento.slice(0, 4)) === f.ano) && (!f.direito || e.direito_uso === f.direito))
    .sort((a, b) => b.data_evento.localeCompare(a.data_evento) || a.nome.localeCompare(b.nome))
    .map((e) => {
      const dele = visiveis.filter((a) => a.evento_id === e.id);
      const capa = dele.find((a) => a.tem_miniatura);
      return {
        id: e.id, nome: e.nome, data_evento: e.data_evento, local: e.local, descricao: e.descricao, tags: e.tags,
        responsavel: e.responsavel, direito_uso: e.direito_uso, capa_url: capa ? `${IMG}/${capa.id}.svg` : null,
        total_arquivos: dele.length, total_bytes: dele.reduce((s, a) => s + a.tamanho_bytes, 0),
        fotos: dele.filter((a) => a.tipo === 'foto').length, videos: dele.filter((a) => a.tipo === 'video').length,
        raws: dele.filter((a) => a.tipo === 'raw').length,
      };
    });
}

function listarArquivos(perfil, f, id = null) {
  const favs = D.FAVORITOS[perfil] || [];
  return arquivosDoPerfil(perfil)
    .filter((a) => {
      const ev = POR_EVENTO.get(a.evento_id);
      return (!id || a.id === id)
        && (!f.q || bate(buscaArquivo(a), f.q) || bate(buscaEvento(ev), f.q))
        && (!f.data || ev.data_evento === f.data || dataBrasil(a.capturado_em) === f.data)
        && (!f.tipo || a.tipo === f.tipo)
        && (!f.ano || Number(ev.data_evento.slice(0, 4)) === f.ano)
        && (!f.direito || direitoEfetivo(ev.direito_uso, a.direito_uso) === f.direito)
        && (!f.evento || a.evento_id === f.evento)
        && (!f.aprovadas || a.aprovada)
        && (!f.favoritos || favs.includes(a.id));
    })
    .sort((a, b) => {
      const ea = POR_EVENTO.get(a.evento_id), eb = POR_EVENTO.get(b.evento_id);
      return eb.data_evento.localeCompare(ea.data_evento) || a.evento_id.localeCompare(b.evento_id)
        || (a.capturado_em || '').localeCompare(b.capturado_em || '') || a.nome_original.localeCompare(b.nome_original);
    });
}

const SEM_SESSAO = [401, { erro: 'Sessão encerrada (demonstração). Entre de novo pelo Portal simulado.', codigo: 'sem_sessao' }];

// Rotas /api fictícias: 'MÉTODO /caminho' → (params, corpo) => [status, resposta]
const ROTAS = {
  'GET /sessao': () => (estado.saiu ? SEM_SESSAO : [200, { ...D.PESSOA, perfil: estado.perfil }]),
  'POST /sessao': (_p, corpo) => {
    if (corpo.acao === 'sair') { estado.saiu = true; return [200, { ok: true }]; }
    if (corpo.acao === 'entrar') { estado.saiu = false; return [200, { ok: true, volta: '/' }]; }
    return [400, { erro: 'Ação desconhecida.' }];
  },
  'GET /eventos': (p) => {
    if (estado.saiu) return SEM_SESSAO;
    const f = lerFiltros(p);
    const id = p.get('id');
    if (id !== null) {
      // Como no servidor: o evento pedido pelo id só volta se o perfil puder vê-lo (sem filtros de busca).
      const ev = listarEventos(estado.perfil, { pagina: 1 }).find((e) => e.id === String(id).toLowerCase());
      return ev ? [200, { evento: ev }] : [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
    }
    return [200, { eventos: listarEventos(estado.perfil, f) }];
  },
  'GET /arquivos': (p) => {
    if (estado.saiu) return SEM_SESSAO;
    const id = p.get('id');
    if (id !== null) {
      const a = ehUuid(id) ? listarArquivos(estado.perfil, { pagina: 1 }, id.toLowerCase())[0] : null;
      return a ? [200, { arquivo: arquivoParaTela(a, estado.perfil) }] : [404, { erro: 'Arquivo não encontrado.', codigo: 'nao_encontrado' }];
    }
    const f = lerFiltros(p);
    const todos = listarArquivos(estado.perfil, f);
    const pagina = todos.slice((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA);
    return [200, { arquivos: pagina.map((a) => arquivoParaTela(a, estado.perfil)), total: todos.length, pagina: f.pagina, por_pagina: POR_PAGINA }];
  },
  'POST /__demo/perfil': (_p, corpo) => {
    if (!D.PERFIS.some((x) => x.codigo === corpo.perfil)) return [400, { erro: 'Perfil desconhecido.' }];
    estado.perfil = corpo.perfil;
    estado.saiu = false;
    return [200, { ok: true, perfil: estado.perfil }];
  },
};

/** A resposta da demonstração para um pedido (usada pelo servidor do Vite e pelos testes). */
export function responderDemo(metodo, caminhoComBusca, corpo = {}) {
  const url = new URL(caminhoComBusca, 'http://demo');
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  const rota = ROTAS[`${metodo} ${caminho}`];
  if (!rota) return [501, { erro: `A demonstração ainda não simula ${metodo} /api${caminho}.` }];
  return rota(url.searchParams, corpo);
}

function json(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}
async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return {}; }
}

// Imagem fictícia (SVG): um quadro de cor lisa com o formato e a legenda. Nenhuma foto de verdade.
const CORES = ['#8a9a8c', '#9a8f7e', '#7f8fa0', '#a08a8a', '#8c8aa0', '#93a08a', '#a0978a', '#7e9a9a'];
const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function imagemFicticia(req, res) {
  const url = new URL(req.url, 'http://demo');
  const id = url.pathname.replace(/^\//, '').replace(/\.svg$/, '');
  const a = D.ARQUIVOS.find((x) => x.id === id);
  if (!a) { res.statusCode = 404; return res.end(); }
  const grande = url.searchParams.get('tam') === 'g';
  const [w, h] = grande ? [1200, 800] : [480, 360];
  const cor = CORES[parseInt(id.slice(-2), 10) % CORES.length];
  const rotulo = a.tipo === 'video' ? 'Vídeo fictício' : 'Imagem fictícia';
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="${cor}"/>
<text x="50%" y="46%" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="${grande ? 44 : 26}" font-weight="700" fill="#ffffff">${escapar(a.legenda)}</text>
<text x="50%" y="${grande ? '55%' : '58%'}" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="${grande ? 26 : 16}" fill="#ffffff">${rotulo} · ${escapar(a.nome_original)}</text>
</svg>`);
}

// Página que faz o papel do Portal: a "entrada" escolhe o perfil e volta para o sistema.
function portalSimulado(req, res) {
  const volta = new URL(req.url, 'http://demo').searchParams.get('volta') || '/';
  const destino = BASE + (/^\/(?![/\\])[^\s\\#]{0,500}$/.test(volta) ? volta : '/');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Portal simulado · demonstração</title></head>
<body style="font-family:Nunito,Arial,sans-serif;background:#fafaf5;color:#2b2b2b;margin:0">
${faixa()}
<main style="max-width:420px;margin:48px auto;padding:24px;background:#fff;border:1px solid #ecece2;border-radius:8px">
  <h1 style="font-size:20px;margin:0 0 8px">Portal Importek (simulado)</h1>
  <p style="font-size:14px;line-height:1.5">Aqui ficaria o Portal de verdade. Na demonstração, escolha o perfil para entrar na Biblioteca de Marketing:</p>
  <p>${D.PERFIS.map((p) => `<button data-perfil="${p.codigo}" style="margin:4px 8px 4px 0;padding:8px 12px;cursor:pointer">${p.rotulo}</button>`).join('')}</p>
</main>
<script>document.querySelectorAll('[data-perfil]').forEach(function(b){b.onclick=function(){
  fetch('${BASE}/api/__demo/perfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({perfil:b.dataset.perfil})})
    .then(function(){location.href=${JSON.stringify(destino)};});};});</script>
</body></html>`);
}

function faixa() {
  return `<div id="demo-faixa" role="note" style="position:fixed;top:0;left:0;right:0;min-height:36px;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:8px 12px;flex-wrap:wrap;background:#7a1f1f;color:#fff;font:600 13px/1.2 Nunito,Arial,sans-serif;padding:4px 12px;box-sizing:border-box">
  <span>${MARCA}</span>
  <span style="font-weight:400">Perfil:</span>
  ${D.PERFIS.map((p) => `<button type="button" data-demo-perfil="${p.codigo}" style="border:1px solid #fff;background:transparent;color:#fff;border-radius:4px;padding:3px 8px;font:inherit;cursor:pointer">${p.rotulo}</button>`).join('')}
</div>
<style>body{padding-top:44px!important}aside[aria-label="Menu do sistema"]{top:44px!important}header.sticky{top:44px!important}</style>
<script>(function(){
  var marcar=function(atual){document.querySelectorAll('[data-demo-perfil]').forEach(function(b){var e=b.dataset.demoPerfil===atual;b.style.background=e?'#fff':'transparent';b.style.color=e?'#7a1f1f':'#fff';});};
  fetch('${BASE}/api/sessao').then(function(r){return r.json();}).then(function(j){if(j.perfil)marcar(j.perfil);}).catch(function(){});
  document.querySelectorAll('[data-demo-perfil]').forEach(function(b){b.onclick=function(){
    fetch('${BASE}/api/__demo/perfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({perfil:b.dataset.demoPerfil})})
      .then(function(){location.reload();});};});
})();</script>`;
}

export default function pluginDemo() {
  return {
    name: 'biblioteca-modo-demonstracao',
    apply: 'serve',
    // O endereço do Portal vira a página simulada daqui (nada sai para a internet).
    config: () => ({ define: { 'import.meta.env.VITE_PORTAL_URL': JSON.stringify(PORTAL_DEMO) } }),
    configureServer(server) {
      server.middlewares.use(`${BASE}/api`, (req, res) => {
        (async () => {
          const corpo = req.method === 'GET' ? {} : await lerCorpo(req);
          const [status, resposta] = responderDemo(req.method, req.url, corpo);
          json(res, status, resposta);
        })().catch((e) => json(res, 500, { erro: String(e?.message || e) }));
      });
      server.middlewares.use(IMG, imagemFicticia);
      server.middlewares.use(PORTAL_DEMO, portalSimulado);
      server.httpServer?.once('listening', () => {
        server.config.logger.info(`\n  ${MARCA}: sem banco, sem R2, sem Portal, sem chaves. Perfis na faixa do topo.\n`);
      });
    },
    transformIndexHtml: { order: 'post', handler: (html) => html.replace(/<body([^>]*)>/, `<body$1>${faixa()}`) },
  };
}
