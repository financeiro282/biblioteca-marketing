// /api/externo — a página do LINK EXTERNO (agência, imprensa: quem abre NÃO tem conta). Fase 4, 25/11/2026.
//   POST /api/externo { acao: 'abrir', codigo, senha? }              → { situacao: 'ok', titulo, mensagem, expira_em, arquivos }
//   POST /api/externo { acao: 'baixar', codigo, senha?, arquivo_id } → { situacao: 'ok', url }
//   Outras situações: 'senha' (pede a senha), 'senha_errada' (+ restantes), 'bloqueado' (+ ate), 'expirado',
//   'revogado', 'nao_encontrado' (404), 'arquivo_fora' (o arquivo saiu do link ou deixou de ter uso liberado).
//
// SEM sessão e SEM cookie: vale o CÓDIGO do link (só o sha256 vai ao banco) e a SENHA (só a prova scrypt vai ao
// banco — api/_senha.js). QUEM DECIDE É O BANCO, a cada pedido (link_abrir / link_baixar, SQL 02): validade,
// revogação, senha (5 erros → 15 min bloqueado) e o direito de cada arquivo ("liberado" no arquivo e no evento).
// A página nunca recebe a chave do original: só links assinados (miniatura e prévia: ver; original: 1 h para baixar).

import { ehUuid } from '../compartilhado/busca.js';
import { formatoDoCodigo } from '../compartilhado/download.js';
import { clienteDoBanco, erro, exigirJson, lerCorpo, responder, responderErro, sha } from './_comum.js';
import { linkDaMiniatura, linkDaPrevia, linkDeDownload } from './_r2.js';
import { provaDaSenha } from './_senha.js';

const SITUACOES = new Set(['ok', 'senha', 'senha_errada', 'bloqueado', 'expirado', 'revogado', 'nao_encontrado', 'arquivo_fora']);

export function ipDe(req) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return ip ? ip.slice(0, 100) : null;
}

// Chama a função do banco; se o link tem senha e a pessoa mandou uma, pede o sal, calcula a prova e chama de novo.
async function noBanco(funcao, args, codigo, senha) {
  const sb = clienteDoBanco();
  const base = { p_codigo_hash: sha(codigo), ...args };
  let { data, error } = await sb.rpc(funcao, { ...base, p_prova: null });
  if (error) throw error;
  if (data?.situacao === 'senha' && senha) {
    const prova = await provaDaSenha(senha, data.sal);
    if (!prova) throw new Error('Senha do link guardada em formato inesperado.');
    ({ data, error } = await sb.rpc(funcao, { ...base, p_prova: prova }));
    if (error) throw error;
  }
  if (!SITUACOES.has(data?.situacao)) throw new Error('Resposta inesperada do banco.');
  return data;
}

// O que a página recebe quando não é "ok" (nunca o sal nem o id do link).
const situacaoParaTela = (d) => ({
  situacao: d.situacao,
  ...(d.restantes !== undefined ? { restantes: d.restantes } : {}),
  ...(d.ate ? { ate: d.ate } : {}),
});

async function abrir(req, corpo) {
  const d = await noBanco('link_abrir', { p_ip: ipDe(req) }, corpo.codigo, corpo.senha);
  if (d.situacao !== 'ok') return situacaoParaTela(d);
  return {
    situacao: 'ok', titulo: d.titulo, mensagem: d.mensagem, expira_em: d.expira_em,
    arquivos: await Promise.all((d.arquivos ?? []).map(async (a) => ({
      id: a.id, tipo: a.tipo, nome: a.nome, extensao: a.extensao, tamanho_bytes: Number(a.tamanho) || 0,
      largura: a.largura, altura: a.altura, duracao_seg: a.duracao_seg === null ? null : Number(a.duracao_seg),
      legenda: a.legenda, autor: a.autor, capturado_em: a.capturado_em,
      miniatura_url: await linkDaMiniatura(a.chave_miniatura), previa_url: await linkDaPrevia(a.chave_previa),
    }))),
  };
}

async function baixar(req, corpo) {
  const id = String(corpo.arquivo_id ?? '').toLowerCase();
  if (!ehUuid(id)) throw erro(400, 'Pedido inválido.');
  const d = await noBanco('link_baixar', { p_arquivo_id: id, p_ip: ipDe(req) }, corpo.codigo, corpo.senha);
  if (d.situacao !== 'ok') return situacaoParaTela(d);
  const url = await linkDeDownload(d.chave, d.nome);
  if (!url) throw erro(503, 'O download está indisponível no momento. Tente mais tarde.', 'sem_r2');
  return { situacao: 'ok', url };
}

const ACOES = { abrir, baixar };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não aceito.' });
    exigirJson(req);
    const corpo = await lerCorpo(req);
    const acao = ACOES[corpo.acao];
    if (!acao) throw erro(400, 'Ação desconhecida.');
    if (!formatoDoCodigo(corpo.codigo)) return responder(res, 404, { situacao: 'nao_encontrado' });
    if (corpo.senha !== undefined && corpo.senha !== null && (typeof corpo.senha !== 'string' || corpo.senha.length > 100)) {
      throw erro(400, 'Senha inválida.');
    }
    const r = await acao(req, corpo);
    return responder(res, r.situacao === 'nao_encontrado' ? 404 : 200, r);
  } catch (e) {
    return responderErro(res, e, 'externo');
  }
}
