// Rotina diária (Fase 5) — chamada pelo cron da Vercel (api/portal.js, 08:00 de Brasília), depois da conferência de
// acessos. Cada parte é independente: uma falha não impede as outras (e fica no log da Vercel).
//   1. zips parados (rotina que caiu) e vencidos — api/_zipador.js;
//   2. lixeira: o que está lá há 30 dias ou mais é apagado de vez — PRIMEIRO no R2, DEPOIS no banco (funções do SQL 03,
//      que conferem de novo os 30 dias). Arquivo cujo R2 falhou fica para a próxima rotina (nunca sobra arquivo no R2
//      sem cadastro);
//   3. uso do dia: soma real do bucket + banco (uso_registrar) e aviso pelo Portal aos Administradores quando um
//      limite de alerta é passado (cada limite avisa uma vez).
// Também usada pelo botão "Medir agora" do painel (só a parte 3) e pelo "Apagar de vez" da lixeira (apagarDoR2).

import { tamanhoLegivel } from '../compartilhado/formatos.js';
import { clienteDoBanco, portal } from './_comum.js';
import { apagarObjetos, somarBucket } from './_r2.js';
import { continuarZipsParados } from './_zipador.js';

/**
 * Apaga no R2 o original, a miniatura e a prévia de cada arquivo. Devolve os ids cujos objetos TODOS saíram
 * (só esses podem sair do banco).
 * @param {{ id: string, chave_original: string, chave_miniatura?: string|null, chave_previa?: string|null }[]} arquivos
 */
export async function apagarDoR2(arquivos) {
  const chaves = (a) => [a.chave_original, a.chave_miniatura, a.chave_previa].filter(Boolean);
  const falharam = new Set(await apagarObjetos(arquivos.flatMap(chaves)));
  if (falharam.size) console.error(`[lixeira] ${falharam.size} objetos do R2 não saíram; os cadastros deles ficam para a próxima vez.`);
  return arquivos.filter((a) => !chaves(a).some((c) => falharam.has(c))).map((a) => a.id);
}

/** Lixeira vencida (30 dias ou mais): até 4 voltas de 500 arquivos por rotina. */
export async function limparLixeiraVencida() {
  const sb = clienteDoBanco();
  const total = { arquivos: 0, eventos: 0 };
  for (let volta = 0; volta < 4; volta++) {
    const { data: v, error } = await sb.rpc('lixeira_vencidos', { p_dias: 30 });
    if (error) throw error;
    const arquivos = v?.arquivos ?? [];
    const eventos = v?.eventos ?? [];
    if (!arquivos.length && !eventos.length) break;
    const prontos = arquivos.length ? await apagarDoR2(arquivos) : [];
    const { data: r, error: e2 } = await sb.rpc('lixeira_apagar_vencidos', { p_arquivo_ids: prontos, p_evento_ids: eventos, p_dias: 30 });
    if (e2) throw e2;
    total.arquivos += r?.arquivos ?? 0;
    total.eventos += r?.eventos ?? 0;
    if (arquivos.length < 500) break;
  }
  if (total.arquivos || total.eventos) console.log(`[lixeira] apagados de vez (30 dias): ${total.arquivos} arquivos, ${total.eventos} eventos.`);
  return total;
}

/** Mede o uso do dia (R2 real + banco). Sem R2 configurado, grava só o do banco. */
export async function medirUso() {
  let r2 = { bytes: -1, objetos: -1 };
  try { r2 = await somarBucket(); } catch (e) { console.error('[uso] não consegui somar o R2:', e?.message || e); }
  const { data, error } = await clienteDoBanco().rpc('uso_registrar', { p_bytes_r2: r2.bytes, p_objetos_r2: r2.objetos });
  if (error) throw error;
  return data;
}

/** Aviso pelo Portal aos Administradores: o uso passou de um limite. Nunca derruba a rotina. */
export async function avisarAlertas(uso, destinatarios) {
  const limites = uso?.novos_alertas ?? [];
  if (!limites.length || !destinatarios?.length) return 0;
  try {
    const p = portal();
    for (const limite of limites) {
      const r = await fetch(`${p.url}/api/notificar`, {
        method: 'POST',
        headers: { Authorization: p.auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para: destinatarios.slice(0, 50),
          titulo: `O armazenamento passou de ${limite} GB`,
          corpo: `A biblioteca está com ${tamanhoLegivel(Number(uso.bytes_total) || 0)}. Veja o painel de uso (custo estimado e maiores eventos).`.slice(0, 500),
          volta: '/uso',
          chave: `uso-${limite}`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) console.error(`[uso] aviso de ${limite} GB respondeu ${r.status}.`);
    }
  } catch (e) {
    console.error('[uso] aviso pelo Portal não saiu:', e?.message || e);
  }
  return limites.length;
}

/** A rotina inteira. `admins`: e-mails dos Administradores (da lista do Portal), para o aviso de uso. */
export async function rotinaDiaria({ admins = [] } = {}) {
  const resultado = {};
  const parte = async (nome, fn) => {
    try { resultado[nome] = await fn(); } catch (e) { console.error(`[rotina] ${nome}:`, e?.message || e); resultado[nome] = 'erro'; }
  };
  await parte('zips', () => continuarZipsParados());
  await parte('lixeira', () => limparLixeiraVencida());
  await parte('uso', async () => {
    const uso = await medirUso();
    const avisos = await avisarAlertas(uso, admins);
    return { bytes_total: uso?.bytes_total, alertas: avisos };
  });
  return resultado;
}
