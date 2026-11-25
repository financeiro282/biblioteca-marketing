// Montagem do zip em FLUXO (sem guardar o arquivo inteiro na memória), só no servidor.
//
// Formato: zip "guardado" (sem compressão — foto e vídeo já vêm comprimidos; comprimir de novo só gastaria tempo),
// nomes em UTF-8 (bit 11) e CRC/tamanhos num descritor depois de cada arquivo (bit 3), porque o CRC só se sabe ao
// fim da leitura. Sem ZIP64: cada parte tem no máximo 2 GB (compartilhado/download.js), abaixo dos 4 GiB do formato
// simples — abre no Windows, no macOS, no 7-Zip e no celular.
//
// Leitura: pedaços de 8 MiB de vários arquivos ao mesmo tempo (o R2 responde mais rápido assim), consumidos NA
// ORDEM. Escrita: `escrever(buf)` (o enviador em partes do R2 junta em blocos de 16 MiB, iguais, como o R2 exige).
// O CRC-32 é o do próprio Node (zlib.crc32, Node 22.2+).

import zlib from 'node:zlib';

const FLAGS = 0x0808;       // bit 3 (descritor depois do conteúdo) + bit 11 (nome em UTF-8)
const VERSAO = 20;          // 2.0
const LIMITE_32 = 0xffffffff;
export const PEDACO_LEITURA = 8 * 1024 * 1024;

const horaSP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Data e hora no formato do zip (MS-DOS), no horário de Brasília. */
export function dataDos(data) {
  let d = new Date(data ?? Date.now());
  if (Number.isNaN(d.getTime())) d = new Date();
  const p = Object.fromEntries(horaSP.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  const ano = Math.min(Math.max(p.year, 1980), 2107);
  return { hora: (p.hour << 11) | (p.minute << 5) | (p.second >> 1), dia: ((ano - 1980) << 9) | (p.month << 5) | p.day };
}

export function cabecalhoLocal(nomeBytes, dos) {
  const b = Buffer.alloc(30 + nomeBytes.length);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(VERSAO, 4);
  b.writeUInt16LE(FLAGS, 6);
  b.writeUInt16LE(0, 8);               // 0 = guardado
  b.writeUInt16LE(dos.hora, 10);
  b.writeUInt16LE(dos.dia, 12);
  // 14..25: CRC e tamanhos = 0 (bit 3: vão no descritor)
  b.writeUInt16LE(nomeBytes.length, 26);
  b.writeUInt16LE(0, 28);
  nomeBytes.copy(b, 30);
  return b;
}

export function descritor(crc, tamanho) {
  const b = Buffer.alloc(16);
  b.writeUInt32LE(0x08074b50, 0);
  b.writeUInt32LE(crc >>> 0, 4);
  b.writeUInt32LE(tamanho, 8);
  b.writeUInt32LE(tamanho, 12);
  return b;
}

export function entradaCentral({ nomeBytes, dos, crc, tamanho, deslocamento }) {
  const b = Buffer.alloc(46 + nomeBytes.length);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(VERSAO, 4);          // feito por (MS-DOS, 2.0)
  b.writeUInt16LE(VERSAO, 6);          // precisa de 2.0
  b.writeUInt16LE(FLAGS, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(dos.hora, 12);
  b.writeUInt16LE(dos.dia, 14);
  b.writeUInt32LE(crc >>> 0, 16);
  b.writeUInt32LE(tamanho, 20);
  b.writeUInt32LE(tamanho, 24);
  b.writeUInt16LE(nomeBytes.length, 28);
  // 30 extra, 32 comentário, 34 disco, 36 atributos internos, 38 externos: tudo 0
  b.writeUInt32LE(deslocamento, 42);
  nomeBytes.copy(b, 46);
  return b;
}

export function fimDoDiretorio(quantos, tamanhoCentral, inicioCentral) {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(0x06054b50, 0);
  b.writeUInt16LE(quantos, 8);
  b.writeUInt16LE(quantos, 10);
  b.writeUInt32LE(tamanhoCentral, 12);
  b.writeUInt32LE(inicioCentral, 16);
  return b;
}

/**
 * Monta o zip. `ler(chave, inicio, fim)` devolve os bytes [inicio, fim) do original (exatos);
 * `escrever(buf)` grava na saída (e segura o ritmo quando a saída está cheia).
 * @param {{ arquivos: { chave: string, nomeNoZip: string, tamanho: number, data?: string }[],
 *           ler: (chave: string, inicio: number, fim: number) => Promise<Uint8Array>,
 *           escrever: (buf: Uint8Array) => Promise<void>, pedaco?: number, simultaneos?: number, prazo?: number }} o
 * @returns {Promise<{ bytes: number, arquivos: number }>}
 */
export async function montarZip({ arquivos, ler, escrever, pedaco = PEDACO_LEITURA, simultaneos = 4, prazo = Infinity }) {
  if (arquivos.length > 65_535) throw new Error('Arquivos demais numa parte do zip.');
  const tarefas = [];
  arquivos.forEach((a, i) => {
    if (!(a.tamanho > 0) || a.tamanho > LIMITE_32) throw new Error(`Tamanho fora do zip simples: ${a.nomeNoZip}`);
    for (let ini = 0; ini < a.tamanho; ini += pedaco) tarefas.push({ i, ini, fim: Math.min(ini + pedaco, a.tamanho) });
  });
  const lidas = new Map();
  let proxima = 0;
  const disparar = () => {
    while (proxima < tarefas.length && lidas.size < simultaneos) {
      const t = tarefas[proxima];
      const p = ler(arquivos[t.i].chave, t.ini, t.fim);
      p.catch(() => {});                 // o erro aparece no await, na ordem; aqui só evita "rejeição sem tratamento"
      lidas.set(proxima++, p);
    }
  };
  let deslocamento = 0;
  const gravar = async (buf) => { await escrever(buf); deslocamento += buf.length; };
  const central = [];
  let k = 0;
  for (let i = 0; i < arquivos.length; i++) {
    const a = arquivos[i];
    const nomeBytes = Buffer.from(a.nomeNoZip, 'utf8');
    const dos = dataDos(a.data);
    const inicio = deslocamento;
    await gravar(cabecalhoLocal(nomeBytes, dos));
    let crc = 0;
    let lidos = 0;
    for (; k < tarefas.length && tarefas[k].i === i; k++) {
      if (Date.now() > prazo) throw Object.assign(new Error('Tempo da rotina esgotado.'), { codigo: 'tempo' });
      disparar();
      const buf = await lidas.get(k);
      lidas.delete(k);
      if (buf.length !== tarefas[k].fim - tarefas[k].ini) throw new Error(`Leitura incompleta: ${a.nomeNoZip}`);
      crc = zlib.crc32(buf, crc);
      lidos += buf.length;
      await gravar(buf);
    }
    if (lidos !== a.tamanho) throw new Error(`Tamanho diferente do esperado: ${a.nomeNoZip}`);
    await gravar(descritor(crc, a.tamanho));
    central.push({ nomeBytes, dos, crc, tamanho: a.tamanho, deslocamento: inicio });
  }
  const inicioCentral = deslocamento;
  for (const e of central) await gravar(entradaCentral(e));
  if (deslocamento > LIMITE_32) throw new Error('O zip passou de 4 GiB (a parte deveria ter no máximo 2 GB).');
  await gravar(fimDoDiretorio(central.length, deslocamento - inicioCentral, inicioCentral));
  return { bytes: deslocamento, arquivos: central.length };
}

/** Repete a operação em falha passageira (rede, R2 ocupado): 3 tentativas, esperando 1 s e 3 s. */
export async function comTentativas(fn, esperas = [1000, 3000]) {
  for (let t = 0; ; t++) {
    try {
      return await fn();
    } catch (e) {
      if (t >= esperas.length) throw e;
      await new Promise((r) => setTimeout(r, esperas[t]));
    }
  }
}

/**
 * Junta o que é escrito em blocos de `tamanhoParte` (todos iguais, menos o último — regra do R2) e manda cada
 * bloco por `enviar(numero, bloco)` (devolve o ETag), até `simultaneos` ao mesmo tempo.
 * @param {{ enviar: (numero: number, bloco: Uint8Array) => Promise<string>, tamanhoParte?: number, simultaneos?: number }} o
 */
export function juntadorDePartes({ enviar, tamanhoParte = 16 * 1024 * 1024, simultaneos = 3 }) {
  let bloco = Buffer.allocUnsafe(tamanhoParte);
  let usado = 0;
  let numero = 0;
  let falha = null;
  const partes = [];
  const andamento = new Set();
  async function despachar(corpo) {
    const n = ++numero;
    const p = comTentativas(() => enviar(n, corpo))
      .then((etag) => { partes.push({ numero: n, etag }); }, (e) => { falha = falha || e; })
      .finally(() => andamento.delete(p));
    andamento.add(p);
    while (andamento.size >= simultaneos) await Promise.race(andamento);
    if (falha) throw falha;
  }
  return {
    async escrever(buf) {
      if (falha) throw falha;
      for (let off = 0; off < buf.length;) {
        const n = Math.min(buf.length - off, tamanhoParte - usado);
        bloco.set(buf.subarray(off, off + n), usado);
        usado += n;
        off += n;
        if (usado === tamanhoParte) {
          const corpo = bloco;
          bloco = Buffer.allocUnsafe(tamanhoParte);
          usado = 0;
          await despachar(corpo);
        }
      }
    },
    /** Manda o último bloco, espera todos e devolve as partes em ordem. */
    async terminar() {
      if (usado > 0 || numero === 0) await despachar(bloco.subarray(0, usado));
      await Promise.all([...andamento]);
      if (falha) throw falha;
      return partes.sort((a, b) => a.numero - b.numero);
    },
  };
}
