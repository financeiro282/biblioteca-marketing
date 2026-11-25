// Rotina do zip em segundo plano (Fase 4). Só no servidor.
//
// COMO ANDA:
//   1. A pessoa pede (api/zips.js, POST pedir): o servidor grava o pedido com as partes (até 2 GB cada) e chama até
//      3 rotinas — cada uma é um POST para o próprio servidor (/api/zips, acao 'gerar', com o CRON_SECRET), que
//      responde na hora e trabalha depois da resposta (`waitUntil`, do pacote oficial @vercel/functions).
//   2. Cada rotina pega uma parte livre NO BANCO (zip_pegar_parte: trava de 5 min, o banco confere de novo o
//      direito de cada arquivo), monta o zip lendo os originais do R2 e grava em zips/<id>/parte-<n>.zip.
//   3. Parte pronta → zip_parte_pronta. Na última, o banco responde zip_pronto e a rotina avisa pelo Portal.
//   4. A função da Vercel vive no máximo 5 min: depois de 1 min trabalhando, a rotina não pega outra parte — chama
//      uma rotina nova e termina. Se ela cair no meio, a trava vence e a parte volta (até 3 tentativas): quem
//      retoma é a próxima rotina, a página "Meus downloads" (ao abrir) ou o cron diário (api/portal.js).
//
// A rotina fala com o banco SEM sessão (a pessoa pode ter fechado a página): só pelas funções zip_* do SQL 02.

import { waitUntil } from '@vercel/functions';
import { chaveDoZip, nomesNoZip, zipPrecisaDeRotina } from '../compartilhado/download.js';
import { tamanhoLegivel } from '../compartilhado/formatos.js';
import { clienteDoBanco, portal } from './_comum.js';
import { abortarEnvio, concluirEnvioEmPartes, criarEnvioEmPartes, enviarParteDoServidor, lerPedaco } from './_r2.js';
import { comTentativas, juntadorDePartes, montarZip } from './_zip.js';

const PEGA_OUTRA_ATE_MS = 60_000;     // depois disso, não começa outra parte nesta rotina
const PRAZO_MS = 270_000;             // a função tem 300 s: para antes, com tempo de avisar o banco
const TRAVA_SEG = 300;

/** Endereço deste projeto na Vercel (o de produção; numa prévia, o da própria prévia). */
export function enderecoProprio() {
  const h = process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  return h ? `https://${String(h).replace(/^https?:\/\//, '')}` : null;
}

/** Chama uma rotina (POST para o próprio servidor). Ela responde na hora; o trabalho segue lá. */
export async function chamarRotina(zipId) {
  const base = enderecoProprio();
  const cron = String(process.env.CRON_SECRET || '').trim();
  if (!base || cron.length < 16) {
    console.error('[zip] sem endereço do projeto ou CRON_SECRET: a rotina do zip não foi chamada.');
    return false;
  }
  try {
    const r = await fetch(`${base}/api/zips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cron}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'gerar', id: zipId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error(`[zip] a rotina respondeu ${r.status}.`);
    return r.ok;
  } catch (e) {
    console.error('[zip] não consegui chamar a rotina:', e?.message || e);
    return false;
  }
}

/** Depois de responder à pessoa: chama até `quantas` rotinas para o zip (uma por parte, no máximo 3). */
export function chamarRotinasDepois(zipId, quantas) {
  const n = Math.max(1, Math.min(3, quantas));
  waitUntil(Promise.all(Array.from({ length: n }, () => chamarRotina(zipId))).catch(() => {}));
}

/** Para "Meus downloads": zip que precisa de rotina (ninguém trabalhando nele) ganha uma, depois da resposta. */
export function retomarSePreciso(zips) {
  const parados = zips.filter((z) => zipPrecisaDeRotina(z));
  if (parados.length) waitUntil(Promise.all(parados.slice(0, 3).map((z) => chamarRotina(z.id))).catch(() => {}));
  return parados.length;
}

/** Cron diário: marca vencidos e retoma os parados (função do banco zips_para_continuar). */
export async function continuarZipsParados() {
  const { data, error } = await clienteDoBanco().rpc('zips_para_continuar');
  if (error) throw error;
  const ids = (data ?? []).map((x) => (typeof x === 'string' ? x : x?.zips_para_continuar ?? x?.id)).filter(Boolean);
  for (const id of ids.slice(0, 20)) await chamarRotina(id);
  return ids.length;
}

/** Uma parte: lê os originais do R2 e grava o zip no R2 (envio em partes de 16 MiB). */
export async function gerarParte(chave, arquivos, prazo) {
  const nomes = nomesNoZip(arquivos.map((a) => ({ nome: a.nome, evento: a.evento })));
  const uploadId = await comTentativas(() => criarEnvioEmPartes(chave, 'application/zip'));
  try {
    const saida = juntadorDePartes({ enviar: (n, bloco) => enviarParteDoServidor(chave, uploadId, n, bloco) });
    const r = await montarZip({
      arquivos: arquivos.map((a, i) => ({ chave: a.chave, nomeNoZip: nomes[i], tamanho: Number(a.tamanho), data: a.data })),
      ler: (c, ini, fim) => comTentativas(() => lerPedaco(c, ini, fim)),
      escrever: (buf) => saida.escrever(buf),
      prazo,
    });
    await comTentativas(async () => concluirEnvioEmPartes(chave, uploadId, await saida.terminar()), [2000]);
    return r;
  } catch (e) {
    await abortarEnvio(chave, uploadId).catch(() => {});
    throw e;
  }
}

const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

/** Aviso pelo Portal (sininho e notificação no aparelho) quando o zip fica pronto. Nunca derruba a rotina. */
export async function avisarZipPronto(zipId, fim) {
  try {
    const p = portal();
    const partes = fim.partes > 1 ? ` em ${fim.partes} partes` : '';
    const r = await fetch(`${p.url}/api/notificar`, {
      method: 'POST',
      headers: { Authorization: p.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        para: fim.email,
        titulo: `Zip pronto: ${fim.titulo || 'arquivos da biblioteca'}`.slice(0, 120),
        corpo: `${fim.arquivos} ${fim.arquivos === 1 ? 'arquivo' : 'arquivos'}${partes}, ${tamanhoLegivel(Number(fim.bytes) || 0)}. Fica disponível até ${dataBR(fim.expira_em)}.`.slice(0, 500),
        volta: '/downloads',
        chave: `zip-${zipId}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error(`[zip] aviso pelo Portal respondeu ${r.status}.`);
  } catch (e) {
    console.error('[zip] aviso pelo Portal não saiu:', e?.message || e);
  }
}

/** A rotina: pega partes livres e monta, até o tempo pedir uma rotina nova. */
export async function trabalhar(zipId, inicio = Date.now()) {
  const sb = clienteDoBanco();
  for (let volta = 0; volta < 50; volta++) {
    if (Date.now() - inicio > PEGA_OUTRA_ATE_MS) {
      await chamarRotina(zipId);
      return 'continua_em_outra';
    }
    const { data: parte, error } = await sb.rpc('zip_pegar_parte', { p_id: zipId, p_segundos: TRAVA_SEG });
    if (error) throw error;
    if (!parte) return 'nada_a_fazer';
    const t0 = Date.now();
    try {
      const r = await gerarParte(chaveDoZip(zipId, parte.n), parte.arquivos ?? [], inicio + PRAZO_MS);
      const seg = Math.max((Date.now() - t0) / 1000, 0.001);
      console.log(`[zip] ${zipId} parte ${parte.n}/${parte.total_partes}: ${r.arquivos} arquivos, ${tamanhoLegivel(r.bytes)} em ${seg.toFixed(1)} s (${(r.bytes / 1e6 / seg).toFixed(1)} MB/s)`);
      const { data: fim, error: e2 } = await sb.rpc('zip_parte_pronta', { p_id: zipId, p_n: parte.n, p_bytes: r.bytes, p_arquivos: r.arquivos });
      if (e2) throw e2;
      if (fim?.zip_pronto) await avisarZipPronto(zipId, fim);
    } catch (e) {
      console.error(`[zip] ${zipId} parte ${parte.n} (tentativa ${parte.tentativa}) falhou:`, e?.message || e);
      const motivo = e?.codigo === 'tempo' ? 'A parte demorou mais que o tempo da rotina.' : 'Falha ao ler ou gravar no armazenamento.';
      const { error: e3 } = await sb.rpc('zip_parte_falhou', { p_id: zipId, p_n: parte.n, p_erro: motivo });
      if (e3) console.error('[zip] não consegui registrar a falha:', e3.message);
    }
  }
  return 'limite_de_voltas';
}
