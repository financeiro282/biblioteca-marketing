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

import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { bate, ehUuid, lerFiltros, normalizar, POR_PAGINA } from '../compartilhado/busca.js';
import { direitoEfetivo } from '../compartilhado/direito.js';
import { camposAlterados, lerEvento } from '../compartilhado/evento.js';
import { lerArquivoEditado, lerIds, lerLote, podeAprovar, tagsDepois } from '../compartilhado/arquivo.js';
import {
  anoDaChave, chaveMiniatura, chaveOriginal, chavePrevia, lerInicio, lerMetadados, lerPartes, PARTES_POR_PEDIDO, planoDeEnvio,
} from '../compartilhado/envio.js';
import {
  disposicao, formatoDoCodigo, lerLink, lerPedidoZip, nomeDoZip, nomesNoZip, planoDoZip, situacaoDoLink, ZIPS_ATIVOS_POR_PESSOA, zipParaTela,
} from '../compartilhado/download.js';
import { pode } from '../compartilhado/perfis.js';
import { montarZip } from '../api/_zip.js';
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
      const capa = (e.capa_arquivo_id && dele.find((a) => a.id === e.capa_arquivo_id && a.tem_miniatura)) || dele.find((a) => a.tem_miniatura);
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

// ── organização dos arquivos na demonstração ───────────────────────────────────────────────────────────
const NAO_ENCONTRADO = [404, { erro: 'Arquivo não encontrado.', codigo: 'nao_encontrado' }];
function arquivoDaPessoa(id) {
  const a = D.ARQUIVOS.find((x) => x.id === String(id ?? '').toLowerCase());
  const ev = a && POR_EVENTO.get(a.evento_id);
  return a && arquivoVisivel(estado.perfil, a, ev) && paraConsulta(a, ev) ? a : null;
}
const SEM_APROVACAO = { aprovada: false };
const ACOES_ARQUIVO = {
  favoritar: { fazer: (c) => {
    if (typeof c.favorito !== 'boolean' || !ehUuid(c.id)) return [400, { erro: 'Pedido inválido.' }];
    const a = arquivoDaPessoa(c.id);
    if (!a) return NAO_ENCONTRADO;
    const lista = (D.FAVORITOS[estado.perfil] ||= []);
    const i = lista.indexOf(a.id);
    if (c.favorito && i < 0) lista.push(a.id);
    if (!c.favorito && i >= 0) lista.splice(i, 1);
    return [200, { favorito: c.favorito }];
  } },
  alterar: { permissao: 'organizar', fazer: (c) => {
    const r = lerArquivoEditado(c.arquivo);
    if (r.erros) return [400, { erro: 'Confira os campos marcados.', codigo: 'campos', erros: r.erros }];
    const a = arquivoDaPessoa(c.id);
    if (!a) return NAO_ENCONTRADO;
    if (a.versao !== Number(c.versao)) return [409, { erro: 'Outra pessoa salvou este arquivo enquanto você editava. Recarregue a página e faça a mudança de novo.', codigo: 'versao' }];
    if (!camposAlterados(a, r.valores).length) return [200, { arquivo: { id: a.id, versao: a.versao } }];
    const ev = POR_EVENTO.get(a.evento_id);
    Object.assign(a, r.valores, { versao: a.versao + 1 }, a.aprovada && !podeAprovar(direitoEfetivo(ev.direito_uso, r.valores.direito_uso)) ? SEM_APROVACAO : {});
    return [200, { arquivo: { id: a.id, versao: a.versao } }];
  } },
  lote: { permissao: 'organizar', fazer: (c) => {
    const r = lerLote(c);
    if (r.erro) return [400, { erro: r.erro }];
    let alterados = 0, semAutorizacao = 0, achados = 0;
    for (const id of r.ids) {
      const a = arquivoDaPessoa(id);
      if (!a) continue;
      achados++;
      const ev = POR_EVENTO.get(a.evento_id);
      const novo = {};
      if (r.mudar.direito_uso !== undefined) novo.direito_uso = r.mudar.direito_uso;
      if (r.mudar.autor !== undefined) novo.autor = r.mudar.autor;
      if (r.mudar.tags_mais || r.mudar.tags_menos) novo.tags = tagsDepois(a.tags, r.mudar.tags_mais, r.mudar.tags_menos);
      const aprova = podeAprovar(direitoEfetivo(ev.direito_uso, novo.direito_uso ?? a.direito_uso));
      if (r.mudar.aprovada === true && !aprova) semAutorizacao++;
      const aprovadaDepois = (r.mudar.aprovada ?? a.aprovada) && aprova;
      if (aprovadaDepois !== a.aprovada) novo.aprovada = aprovadaDepois;
      if (!camposAlterados(a, novo).length) continue;
      Object.assign(a, novo, { versao: a.versao + 1 });
      alterados++;
    }
    return [200, { alterados, conflitos: 0, sem_autorizacao: semAutorizacao, nao_encontrados: r.ids.length - achados }];
  } },
  capa: { permissao: 'organizar', fazer: (c) => {
    const ev = POR_EVENTO.get(String(c.evento_id ?? '').toLowerCase());
    if (!ev || ev.excluido_em || !eventoVisivel(estado.perfil, ev)) return [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
    if (c.arquivo_id === null) { ev.capa_arquivo_id = null; return [200, { ok: true }]; }
    const a = arquivoDaPessoa(c.arquivo_id);
    if (!a || a.evento_id !== ev.id) return NAO_ENCONTRADO;
    if (!a.tem_miniatura) return [400, { erro: 'Este arquivo não tem miniatura para ser a capa.', codigo: 'sem_miniatura' }];
    ev.capa_arquivo_id = a.id;
    return [200, { ok: true }];
  } },
  lixeira: { permissao: 'excluir', fazer: (c) => {
    const ids = lerIds(c.ids);
    if (!ids) return [400, { erro: 'Escolha de 1 a 500 arquivos.' }];
    let n = 0;
    for (const id of ids) { const a = arquivoDaPessoa(id); if (a) { a.excluido_em = new Date().toISOString(); n++; } }
    return [200, { na_lixeira: n }];
  } },
};

// ── envio na demonstração ───────────────────────────────────────────────────────────────────────────────
// Mesmas regras (compartilhado/envio.js). Os bytes enviados ao "R2" de mentira são só contados e descartados.
// Para ver a retomada: um arquivo com "queda" no nome falha a 1ª tentativa (a parte 2, ou o envio simples).
export const ENVIOS = new Map();
const R2_DEMO = `${BASE}/__demo/r2`;
const linkDemo = (env, parte = null) => `${R2_DEMO}/${env.chave}${parte ? `?partNumber=${parte}` : ''}`;
function linksDemo(env) {
  const ano = env.chave.split('/')[1];
  return {
    original: env.modo === 'simples' ? linkDemo(env) : null,
    miniatura: `${R2_DEMO}/${chaveMiniatura(ano, env.id)}`,
    previa: env.tipo === 'video' ? null : `${R2_DEMO}/${chavePrevia(ano, env.id)}`,
  };
}

function iniciarDemo(corpo) {
  const r = lerInicio(corpo);
  if (r.erro) return [400, { erro: r.erro }];
  const v = r.valores;
  const ev = POR_EVENTO.get(v.evento_id);
  if (!ev || ev.excluido_em || !eventoVisivel(estado.perfil, ev)) return [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
  const ja = D.ARQUIVOS.find((a) => a.sha256 === v.sha256 && !a.excluido_em);
  if (ja) {
    const onde = POR_EVENTO.get(ja.evento_id);
    return [409, { erro: `Este arquivo já está no evento "${onde.nome}".`, codigo: 'duplicado', arquivo_id: ja.id, evento_id: ja.evento_id, evento_nome: onde.nome }];
  }
  let env = [...ENVIOS.values()].find((e) => e.sha === v.sha256 && !e.pronto);
  const retomada = !!env;
  if (env) Object.assign(env, { evento_id: ev.id, nome: v.nome_original, direito: v.direito_uso, autor: v.autor });
  else {
    const id = randomUUID();
    const plano = planoDeEnvio(v.tamanho_bytes);
    env = {
      id, sha: v.sha256, nome: v.nome_original, tamanho: v.tamanho_bytes, tipo: v.tipo, ext: v.extensao, evento_id: ev.id,
      chave: chaveOriginal(anoDaChave(ev.data_evento), id, v.extensao), modo: plano.modo, parte: plano.parte_bytes, total: plano.total_partes,
      partes: new Map(), original: null, miniatura: false, previa: false, autor: v.autor, direito: v.direito_uso, pronto: false, falhou: false,
    };
    ENVIOS.set(id, env);
  }
  const prontas = env.modo === 'partes'
    ? [...env.partes.entries()].filter(([n, t]) => t === env.parte || n === env.total).map(([n]) => ({ numero: n, etag: `"demo-${n}"` }))
    : [];
  return [200, { arquivo: { id: env.id, modo: env.modo, parte_bytes: env.parte, total_partes: env.total, partes_prontas: prontas }, links: linksDemo(env), retomada }];
}

function concluirDemo(env, corpo) {
  if (env.pronto) return [200, { arquivo: { id: env.id } }];
  let recebido = env.original;
  if (env.modo === 'partes') {
    const partes = lerPartes(corpo.partes, env.total);
    if (!partes || partes.some((p) => !env.partes.has(p.numero))) return [400, { erro: 'Faltam partes do arquivo. Envie de novo.', codigo: 'partes' }];
    recebido = partes.reduce((s, p) => s + env.partes.get(p.numero), 0);
  }
  if (recebido !== env.tamanho) return [409, { erro: 'O arquivo não chegou inteiro ao armazenamento. Envie de novo.', codigo: 'incompleto' }];
  const m = lerMetadados(corpo.metadados);
  const ev = POR_EVENTO.get(env.evento_id);
  D.ARQUIVOS.push({
    id: env.id, evento_id: env.evento_id, tipo: env.tipo, extensao: env.ext, nome_original: env.nome, tamanho_bytes: env.tamanho,
    largura: m.largura, altura: m.altura, duracao_seg: m.duracao_seg, capturado_em: m.capturado_em ?? `${ev.data_evento}T15:00:00.000Z`,
    camera: m.camera, autor: `${env.autor || 'Envio de teste'} (exemplo)`, legenda: 'Enviado na demonstração', tags: [],
    direito_uso: env.direito, aprovada: false, situacao: 'pronto', excluido_em: null,
    tem_miniatura: corpo.miniatura === true && env.miniatura, sha256: env.sha, versao: 1,
  });
  env.pronto = true;
  return [200, { arquivo: { id: env.id } }];
}

// O "R2" de mentira: recebe o PUT, conta os bytes e descarta (nada é gravado em disco nem guardado na memória).
async function r2Ficticio(req, res) {
  let bytes = 0;
  for await (const p of req) bytes += p.length;
  if (req.method !== 'PUT') { res.statusCode = 405; return res.end(); }
  const url = new URL(req.url, 'http://demo');
  const chave = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const env = ENVIOS.get(/([0-9a-f-]{36})\.[a-z0-9]+$/.exec(chave)?.[1]);
  if (!env) { res.statusCode = 404; return res.end(); }
  const parte = Number(url.searchParams.get('partNumber')) || null;
  if (/queda/i.test(env.nome) && !env.falhou && (parte === 2 || (!parte && chave === env.chave))) {
    env.falhou = true;
    res.statusCode = 503;
    return res.end();
  }
  if (chave.startsWith('miniaturas/')) env.miniatura = bytes > 0;
  else if (chave.startsWith('previas/')) env.previa = bytes > 0;
  else if (parte) env.partes.set(parte, bytes);
  else env.original = bytes;
  res.statusCode = 200;
  res.setHeader('ETag', `"demo-${parte ?? 1}"`);
  res.end();
}

// ── Fase 4: download, zip e link externo ─────────────────────────────────────────────────────────────────
// Download: a imagem fictícia (SVG) com o NOME do original. Zip: montado DE VERDADE (api/_zip.js) com essas imagens;
// cada parte "fica pronta" 3 s depois da anterior (a rotina de verdade leva minutos). Link externo: a mesma regra do
// banco (só "liberado" em evento "liberado", senha pelo scrypt, 5 erros → 15 min), na memória do `npm run dev`.
const BAIXAR = `${BASE}/__demo/baixar`;
export const relogio = { agora: () => Date.now() };       // os testes adiantam o relógio
const SEG_POR_PARTE = 3000;
const ZIPS = [];
const LINKS = [];
const sha256 = (t) => createHash('sha256').update(String(t)).digest('hex');
const porCaptura = (x, y) => String(x.capturado_em).localeCompare(String(y.capturado_em)) || x.nome_original.localeCompare(y.nome_original);

function zipNoMomento(z) {
  const agora = relogio.agora();
  const partes = z.partes.map((p, i) => {
    const pronta = agora >= z.criado + (i + 1) * SEG_POR_PARTE;
    const gerando = !pronta && agora >= z.criado + i * SEG_POR_PARTE;
    return { ...p, situacao: pronta ? 'pronto' : gerando ? 'gerando' : 'na_fila', ...(pronta ? { bytes_zip: p.bytes + 22 * p.ids.length, arquivos: p.ids.length } : {}) };
  });
  const tudo = partes.every((p) => p.situacao === 'pronto');
  const fim = z.criado + z.partes.length * SEG_POR_PARTE;
  return {
    id: z.id, titulo: z.titulo, arquivo_ids: z.arquivo_ids, partes, erro: null,
    situacao: tudo ? 'pronto' : partes.some((p) => p.situacao !== 'na_fila') ? 'gerando' : 'na_fila',
    criado_em: new Date(z.criado).toISOString(), pronto_em: tudo ? new Date(fim).toISOString() : null,
    expira_em: tudo ? new Date(fim + 7 * 86_400_000).toISOString() : null,
    total_bytes: partes.reduce((s, p) => s + (p.bytes_zip ?? p.bytes), 0),
  };
}
const foraDe = (z) => {
  const noZip = new Set(z.partes.flatMap((p) => p.ids));
  return new Map(z.arquivo_ids.filter((id) => !noZip.has(id)).map((id) => D.ARQUIVOS.find((a) => a.id === id))
    .map((a) => [a.id, { id: a.id, nome_original: a.nome_original, tamanho_bytes: a.tamanho_bytes }]));
};

function pedirZipDemo(corpo) {
  const pedido = lerPedidoZip(corpo);
  if (pedido.erro) return [400, { erro: pedido.erro }];
  const ativos = ZIPS.filter((z) => z.perfil === estado.perfil && ['na_fila', 'gerando'].includes(zipNoMomento(z).situacao));
  if (ativos.length >= ZIPS_ATIVOS_POR_PESSOA) {
    return [429, { erro: `Você já tem ${ZIPS_ATIVOS_POR_PESSOA} zips sendo preparados. Espere um deles ficar pronto em "Meus downloads".`, codigo: 'muitos_zips' }];
  }
  const visiveis = arquivosDoPerfil(estado.perfil);
  let arquivos;
  let titulo;
  if (pedido.evento_id) {
    const ev = eventosDoPerfil(estado.perfil).find((e) => e.id === pedido.evento_id);
    if (!ev) return [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
    arquivos = visiveis.filter((a) => a.evento_id === ev.id).sort(porCaptura);
    titulo = ev.nome;
  } else {
    const ordem = new Map(pedido.ids.map((id, i) => [id, i]));
    arquivos = visiveis.filter((a) => ordem.has(a.id)).sort((x, y) => ordem.get(x.id) - ordem.get(y.id));
    const eventos = new Set(arquivos.map((a) => POR_EVENTO.get(a.evento_id).nome));
    const qtd = `${arquivos.length} ${arquivos.length === 1 ? 'arquivo' : 'arquivos'}`;
    titulo = eventos.size === 1 ? `${[...eventos][0]} (${qtd})` : `Seleção de ${qtd}`;
  }
  if (!arquivos.length) return [400, { erro: 'Nenhum arquivo para baixar.', codigo: 'vazio' }];
  const plano = planoDoZip(arquivos);
  const fora = plano.fora.map((id) => arquivos.find((a) => a.id === id)).map((a) => ({ id: a.id, nome_original: a.nome_original, tamanho_bytes: a.tamanho_bytes }));
  if (!plano.partes.length) return [200, { zip: null, fora }];
  const z = { id: randomUUID(), perfil: estado.perfil, titulo, arquivo_ids: arquivos.map((a) => a.id), partes: plano.partes, criado: relogio.agora() };
  ZIPS.unshift(z);
  return [200, { zip: zipParaTela(zipNoMomento(z), foraDe(z), relogio.agora()), fora }];
}

const liberadoParaLink = (a) => {
  const ev = a && POR_EVENTO.get(a.evento_id);
  return !!ev && paraConsulta(a, ev) && a.direito_uso === 'liberado' && ev.direito_uso === 'liberado';
};
const SAL_DEMO = /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{16,64}$/;
const provaDemo = (senha, sal) => (SAL_DEMO.test(sal)
  ? scryptSync(String(senha).normalize('NFC'), sal.split('$')[4], 32, { N: 16384, r: 8, p: 1 }).toString('base64url') : null);

function linkParaTelaDemo(l) {
  return {
    id: l.id, titulo: l.titulo, destinatario: l.destinatario, mensagem: l.mensagem, expira_em: l.expira_em,
    revogado_em: l.revogado_em, revogado_por_nome: l.revogado_por_nome ?? null, criado_em: l.criado_em,
    criado_por_nome: l.criado_por_nome, acessos: l.acessos, downloads: l.downloads, ultimo_acesso_em: l.ultimo_acesso_em,
    com_senha: !!l.senha_hash, arquivos: l.ids.length, situacao: situacaoDoLink(l, relogio.agora()),
  };
}

function criarLinkDemo(corpo) {
  const r = lerLink(corpo);
  if (r.erros) return [400, { erro: 'Confira os campos marcados.', codigo: 'campos', erros: r.erros }];
  const v = r.valores;
  const permitidos = v.ids.filter((id) => liberadoParaLink(D.ARQUIVOS.find((a) => a.id === id)));
  if (!permitidos.length) {
    return [400, { erro: 'Nenhum dos arquivos escolhidos tem uso liberado. Link externo só leva arquivo com "Uso liberado" (no arquivo e no evento).', codigo: 'sem_liberado' }];
  }
  const codigo = randomBytes(32).toString('base64url');
  const sal = `scrypt$16384$8$1$${randomBytes(16).toString('base64url')}`;
  const agora = relogio.agora();
  const l = {
    id: randomUUID(), codigo_hash: sha256(codigo), titulo: v.titulo, destinatario: v.destinatario, mensagem: v.mensagem,
    senha_hash: v.senha ? `${sal}$${provaDemo(v.senha, sal)}` : null, expira_em: new Date(agora + v.dias * 86_400_000).toISOString(),
    revogado_em: null, ids: permitidos, acessos: 0, downloads: 0, ultimo_acesso_em: null, tentativas: 0, bloqueado_ate: null,
    criado_em: new Date(agora).toISOString(), criado_por_nome: D.PESSOA.nome,
  };
  LINKS.unshift(l);
  return [200, { link: { id: l.id, expira_em: l.expira_em }, endereco: `${BASE}/l#${codigo}`, incluidos: permitidos.length, recusados: v.ids.length - permitidos.length }];
}

function externoDemo(corpo) {
  if (corpo.acao !== 'abrir' && corpo.acao !== 'baixar') return [400, { erro: 'Ação desconhecida.' }];
  if (!formatoDoCodigo(corpo.codigo)) return [404, { situacao: 'nao_encontrado' }];
  const l = LINKS.find((x) => x.codigo_hash === sha256(corpo.codigo));
  const agora = relogio.agora();
  if (!l) return [404, { situacao: 'nao_encontrado' }];
  if (l.revogado_em) return [200, { situacao: 'revogado' }];
  if (Date.parse(l.expira_em) <= agora) return [200, { situacao: 'expirado' }];
  if (l.bloqueado_ate && Date.parse(l.bloqueado_ate) > agora) return [200, { situacao: 'bloqueado', ate: l.bloqueado_ate }];
  if (l.senha_hash) {
    if (!corpo.senha) return [200, { situacao: 'senha' }];
    if (provaDemo(corpo.senha, l.senha_hash.replace(/\$[^$]*$/, '')) !== l.senha_hash.split('$')[5]) {
      l.tentativas++;
      if (l.tentativas >= 5) {
        l.tentativas = 0;
        l.bloqueado_ate = new Date(agora + 15 * 60_000).toISOString();
        return [200, { situacao: 'bloqueado', ate: l.bloqueado_ate }];
      }
      return [200, { situacao: 'senha_errada', restantes: 5 - l.tentativas }];
    }
    l.tentativas = 0;
  }
  const arquivos = l.ids.map((id) => D.ARQUIVOS.find((a) => a.id === id)).filter(liberadoParaLink).sort(porCaptura);
  l.ultimo_acesso_em = new Date(agora).toISOString();
  if (corpo.acao === 'abrir') {
    l.acessos++;
    return [200, {
      situacao: 'ok', titulo: l.titulo, mensagem: l.mensagem, expira_em: l.expira_em,
      arquivos: arquivos.map((a) => ({
        id: a.id, tipo: a.tipo, nome: a.nome_original, extensao: a.extensao, tamanho_bytes: a.tamanho_bytes,
        largura: a.largura, altura: a.altura, duracao_seg: a.duracao_seg, legenda: a.legenda, autor: a.autor, capturado_em: a.capturado_em,
        miniatura_url: a.tem_miniatura ? `${IMG}/${a.id}.svg` : null, previa_url: a.tipo === 'foto' ? `${IMG}/${a.id}.svg?tam=g` : null,
      })),
    }];
  }
  const a = arquivos.find((x) => x.id === String(corpo.arquivo_id ?? '').toLowerCase());
  if (!a) return [200, { situacao: 'arquivo_fora' }];
  l.downloads++;
  return [200, { situacao: 'ok', url: `${BAIXAR}/arquivo/${a.id}` }];
}

// O "R2" dos downloads: o original (a imagem fictícia, com o nome de verdade) e o zip (montado de verdade).
async function baixarFicticio(req, res) {
  const [tipo, id, n] = new URL(req.url, 'http://demo').pathname.split('/').filter(Boolean);
  if (tipo === 'arquivo') {
    const a = D.ARQUIVOS.find((x) => x.id === id);
    if (!a) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', disposicao(a.nome_original));
    return res.end(Buffer.from(svgFicticio(a, true)));
  }
  const z = tipo === 'zip' && ZIPS.find((x) => x.id === id);
  const parte = z && z.partes.find((p) => p.n === Number(n));
  if (!parte) { res.statusCode = 404; return res.end(); }
  const arqs = parte.ids.map((x) => D.ARQUIVOS.find((a) => a.id === x));
  const conteudo = new Map(arqs.map((a) => [a.id, Buffer.from(svgFicticio(a, true))]));
  const nomes = nomesNoZip(arqs.map((a) => ({ nome: a.nome_original, evento: POR_EVENTO.get(a.evento_id).nome })));
  const blocos = [];
  await montarZip({
    arquivos: arqs.map((a, i) => ({ chave: a.id, nomeNoZip: nomes[i], tamanho: conteudo.get(a.id).length, data: a.capturado_em })),
    ler: async (c, ini, fim) => conteudo.get(c).subarray(ini, fim),
    escrever: async (b) => { blocos.push(Buffer.from(b)); },
  });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', disposicao(nomeDoZip(z.titulo, parte.n, z.partes.length)));
  return res.end(Buffer.concat(blocos));
}

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
      return ev ? [200, { evento: { ...ev, versao: POR_EVENTO.get(ev.id).versao } }] : [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
    }
    return [200, { eventos: listarEventos(estado.perfil, f) }];
  },
  // Criar e alterar evento (como api/eventos.js): a mesma conferência dos campos, da permissão e da versão.
  // Fica só na memória do `npm run dev` (reiniciar volta aos eventos de exemplo).
  'POST /eventos': (_p, corpo) => {
    if (estado.saiu) return SEM_SESSAO;
    if (corpo.acao === 'lixeira') {
      if (!pode(estado.perfil, 'excluir')) return [403, { erro: 'Seu perfil não exclui.', codigo: 'sem_permissao' }];
      const ev = POR_EVENTO.get(String(corpo.id ?? '').toLowerCase());
      if (!ev || ev.excluido_em || !eventoVisivel(estado.perfil, ev)) return [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
      ev.excluido_em = new Date().toISOString();
      return [200, { ok: true }];
    }
    if (corpo.acao !== 'criar' && corpo.acao !== 'alterar') return [400, { erro: 'Ação desconhecida.' }];
    if (!pode(estado.perfil, 'organizar')) return [403, { erro: 'Seu perfil não altera eventos nem arquivos.', codigo: 'sem_permissao' }];
    const r = lerEvento(corpo.evento);
    if (r.erros) return [400, { erro: 'Confira os campos marcados.', codigo: 'campos', erros: r.erros }];
    if (corpo.acao === 'criar') {
      const ev = { id: randomUUID(), ...r.valores, capa_arquivo_id: null, excluido_em: null, versao: 1 };
      D.EVENTOS.push(ev);
      POR_EVENTO.set(ev.id, ev);
      return [200, { evento: { id: ev.id } }];
    }
    const ev = POR_EVENTO.get(String(corpo.id ?? '').toLowerCase());
    if (!ev || ev.excluido_em || !eventoVisivel(estado.perfil, ev)) return [404, { erro: 'Evento não encontrado.', codigo: 'nao_encontrado' }];
    if (ev.versao !== Number(corpo.versao)) {
      return [409, { erro: 'Outra pessoa salvou este evento enquanto você editava. Recarregue a página e faça a mudança de novo.', codigo: 'versao' }];
    }
    if (camposAlterados(ev, r.valores).length) Object.assign(ev, r.valores, { versao: ev.versao + 1 });
    return [200, { evento: { id: ev.id, versao: ev.versao } }];
  },
  'GET /arquivos': (p) => {
    if (estado.saiu) return SEM_SESSAO;
    const baixar = p.get('baixar');
    if (baixar !== null) {
      const a = ehUuid(baixar) ? listarArquivos(estado.perfil, { pagina: 1 }, baixar.toLowerCase())[0] : null;
      return a ? [200, { url: `${BAIXAR}/arquivo/${a.id}`, nome: a.nome_original, tamanho_bytes: a.tamanho_bytes }] : [404, { erro: 'Arquivo não encontrado.', codigo: 'nao_encontrado' }];
    }
    const id = p.get('id');
    if (id !== null) {
      const a = ehUuid(id) ? listarArquivos(estado.perfil, { pagina: 1 }, id.toLowerCase())[0] : null;
      return a ? [200, { arquivo: { ...arquivoParaTela(a, estado.perfil), versao: a.versao } }] : [404, { erro: 'Arquivo não encontrado.', codigo: 'nao_encontrado' }];
    }
    const f = lerFiltros(p);
    const todos = listarArquivos(estado.perfil, f);
    const pagina = todos.slice((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA);
    return [200, { arquivos: pagina.map((a) => arquivoParaTela(a, estado.perfil)), total: todos.length, pagina: f.pagina, por_pagina: POR_PAGINA }];
  },
  // Envio (como api/envio.js), com um "R2" de mentira em /biblioteca/__demo/r2 que só CONTA os bytes e descarta
  // o conteúdo (nada é guardado). O arquivo novo aparece nas listas com imagem fictícia.
  'POST /envio': (_p, corpo) => {
    if (estado.saiu) return SEM_SESSAO;
    if (!pode(estado.perfil, 'enviar')) return [403, { erro: 'Seu perfil não envia arquivos.', codigo: 'sem_permissao' }];
    if (corpo.acao === 'iniciar') return iniciarDemo(corpo);
    const env = ENVIOS.get(String(corpo.id ?? ''));
    if (!env) return [404, { erro: 'Envio não encontrado.', codigo: 'nao_encontrado' }];
    if (corpo.acao === 'assinar') {
      const pedidas = Array.isArray(corpo.partes) ? corpo.partes.map(Number) : [];
      if (pedidas.length > PARTES_POR_PEDIDO || pedidas.some((n) => !Number.isInteger(n) || n < 1 || n > env.total)) return [400, { erro: 'Pedido inválido.' }];
      return [200, { partes: pedidas.map((n) => ({ numero: n, url: linkDemo(env, n) })), links: linksDemo(env) }];
    }
    if (corpo.acao === 'cancelar') { env.partes.clear(); return [200, { ok: true }]; }
    if (corpo.acao === 'concluir') return concluirDemo(env, corpo);
    return [400, { erro: 'Ação desconhecida.' }];
  },
  // Organização dos arquivos (como api/arquivos.js): favoritos de cada perfil, editar, lote, capa e lixeira.
  'POST /arquivos': (_p, corpo) => {
    if (estado.saiu) return SEM_SESSAO;
    const acao = ACOES_ARQUIVO[corpo.acao];
    if (!acao) return [400, { erro: 'Ação desconhecida.' }];
    if (acao.permissao && !pode(estado.perfil, acao.permissao)) return [403, { erro: 'Seu perfil não permite isto.', codigo: 'sem_permissao' }];
    return acao.fazer(corpo);
  },
  // Fase 4 (como api/zips.js, api/links.js e api/externo.js).
  'GET /zips': (p) => {
    if (estado.saiu) return SEM_SESSAO;
    const baixar = p.get('baixar');
    if (baixar !== null) {
      const z = ZIPS.find((x) => x.id === baixar && x.perfil === estado.perfil);
      if (!z) return [404, { erro: 'Zip não encontrado.', codigo: 'nao_encontrado' }];
      const n = Number(p.get('parte') || 1);
      const agora = zipNoMomento(z);
      if (agora.situacao !== 'pronto' || !agora.partes.some((x) => x.n === n)) return [409, { erro: 'Este zip ainda não está pronto.', codigo: 'nao_pronto' }];
      return [200, { url: `${BAIXAR}/zip/${z.id}/${n}` }];
    }
    return [200, { zips: ZIPS.filter((z) => z.perfil === estado.perfil).map((z) => zipParaTela(zipNoMomento(z), foraDe(z), relogio.agora())) }];
  },
  'POST /zips': (_p, corpo) => {
    if (estado.saiu) return SEM_SESSAO;
    if (corpo.acao !== 'pedir') return [400, { erro: 'Ação desconhecida.' }];
    return pedirZipDemo(corpo);
  },
  'GET /links': () => {
    if (estado.saiu) return SEM_SESSAO;
    if (!pode(estado.perfil, 'compartilhar')) return [403, { erro: 'Seu perfil não cria links externos.', codigo: 'sem_permissao' }];
    return [200, { links: LINKS.map(linkParaTelaDemo) }];
  },
  'POST /links': (_p, corpo) => {
    if (estado.saiu) return SEM_SESSAO;
    if (!pode(estado.perfil, 'compartilhar')) return [403, { erro: 'Seu perfil não cria links externos.', codigo: 'sem_permissao' }];
    if (corpo.acao === 'criar') return criarLinkDemo(corpo);
    if (corpo.acao === 'revogar') {
      const l = LINKS.find((x) => x.id === String(corpo.id ?? '').toLowerCase());
      if (!l) return [404, { erro: 'Link não encontrado.', codigo: 'nao_encontrado' }];
      if (l.revogado_em) return [200, { ok: true, ja_estava: true }];
      Object.assign(l, { revogado_em: new Date(relogio.agora()).toISOString(), revogado_por_nome: D.PESSOA.nome });
      return [200, { ok: true }];
    }
    return [400, { erro: 'Ação desconhecida.' }];
  },
  // A página do link (visitante): sem sessão, vale o código.
  'POST /externo': (_p, corpo) => externoDemo(corpo),
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
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(svgFicticio(a, url.searchParams.get('tam') === 'g'));
}
function svgFicticio(a, grande) {
  const [w, h] = grande ? [1200, 800] : [480, 360];
  const cor = CORES[parseInt(a.id.slice(-2), 10) % CORES.length];
  const rotulo = a.tipo === 'video' ? 'Vídeo fictício' : 'Imagem fictícia';
  return (`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
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
      server.middlewares.use(BAIXAR, (req, res) => { baixarFicticio(req, res).catch(() => { res.statusCode = 500; res.end(); }); });
      server.middlewares.use(R2_DEMO, (req, res) => { r2Ficticio(req, res).catch(() => { res.statusCode = 500; res.end(); }); });
      server.middlewares.use(PORTAL_DEMO, portalSimulado);
      server.httpServer?.once('listening', () => {
        server.config.logger.info(`\n  ${MARCA}: sem banco, sem R2, sem Portal, sem chaves. Perfis na faixa do topo.\n`);
      });
    },
    transformIndexHtml: { order: 'post', handler: (html) => html.replace(/<body([^>]*)>/, `<body$1>${faixa()}`) },
  };
}
