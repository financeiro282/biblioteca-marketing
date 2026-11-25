// A FILA DE ENVIO (Fase 2): leva cada arquivo do computador ao R2, direto, sem passar pelo servidor.
//
// Para cada arquivo: conferir (SHA-256) → iniciar (o servidor registra e diz se já existe) → prévias e dados →
// enviar o original (um PUT até 32 MB; acima, em partes de 16 MB, 3 ao mesmo tempo) → miniatura e foto grande →
// concluir (o servidor confere no R2 que o arquivo chegou inteiro). 3 arquivos ao mesmo tempo.
//
// CONEXÃO CAIU: cada pedido tenta de novo sozinho (1 s, 3 s, 10 s, 30 s, 60 s…); sem internet, espera ela voltar
// (evento "online") e continua de onde parou — no envio em partes, só as partes que faltam.
// ABA FECHADA: ao arrastar o mesmo arquivo de novo, o servidor reconhece o SHA-256 e devolve as partes que já
// chegaram; só o resto sobe.
// LINK VENCIDO (15 min): o R2 responde 403 e a fila pede links novos ao servidor.

import { api, ErroApi } from "../api";
import { faixaDaParte, PARTES_POR_PEDIDO } from "../../compartilhado/envio.js";
import { formatoDoArquivo } from "../../compartilhado/formatos.js";
import { sha256DoArquivo } from "./hash";
import { prepararArquivo, type Resultado } from "./imagens";

export type Situacao = "fila" | "conferindo" | "preparando" | "enviando" | "concluindo" | "pronto" | "duplicado" | "erro" | "cancelado";

export type Item = {
  chave: string;                 // nome + tamanho + data do arquivo (para não pôr o mesmo arquivo duas vezes na fila)
  arquivo: File;
  situacao: Situacao;
  enviados: number;              // bytes do original já no R2
  conferidos: number;            // bytes lidos para o SHA-256
  mensagem?: string;             // erro, duplicado ("já está no evento X") ou aviso (sem prévia)
  esperandoConexao?: boolean;
  retomado?: boolean;
  toca?: boolean;                // vídeo abre no navegador?
  id?: string;                   // id do arquivo no banco
  eventoDuplicado?: string;      // id do evento onde o arquivo já está
  cancelar?: () => void;
};

type Links = { original: string | null; miniatura: string | null; previa: string | null };
type Inicio = { arquivo: { id: string; modo: "simples" | "partes"; parte_bytes: number | null; total_partes: number; partes_prontas: { numero: number; etag: string }[] }; links: Links; retomada: boolean };

export type Opcoes = { eventoId: string; direito: string; autor: string };

const SIMULTANEOS = 3;
const PARTES_SIMULTANEAS = 3;
const ESPERAS = [1_000, 3_000, 10_000, 30_000, 60_000];
const TENTATIVAS = 10;

class Cancelado extends Error {}
class FalhaR2 extends Error { constructor(public status: number) { super(`R2 ${status}`); } }

const dormir = (ms: number, sinal: AbortSignal) => new Promise<void>((ok, falha) => {
  const t = setTimeout(ok, ms);
  sinal.addEventListener("abort", () => { clearTimeout(t); falha(new Cancelado()); }, { once: true });
});
const esperarConexao = (sinal: AbortSignal) => new Promise<void>((ok, falha) => {
  if (navigator.onLine) return ok();
  const voltou = () => { window.removeEventListener("online", voltou); ok(); };
  window.addEventListener("online", voltou);
  sinal.addEventListener("abort", () => { window.removeEventListener("online", voltou); falha(new Cancelado()); }, { once: true });
});

// PUT direto no R2, com progresso (XMLHttpRequest: o fetch não mostra o progresso do envio). Devolve o ETag.
function put(url: string, corpo: Blob, aoProgresso: (n: number) => void, sinal: AbortSignal): Promise<string> {
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => aoProgresso(e.loaded);
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok(x.getResponseHeader("ETag") || "") : falha(new FalhaR2(x.status)));
    x.onerror = () => falha(new FalhaR2(0));
    x.ontimeout = () => falha(new FalhaR2(0));
    const parar = () => x.abort();
    sinal.addEventListener("abort", parar, { once: true });
    x.onabort = () => falha(new Cancelado());
    x.send(corpo);
  });
}

// Erro que vale tentar de novo: sem conexão, servidor ou R2 fora do ar, link vencido (403 do R2).
const vale = (e: unknown) =>
  (e instanceof FalhaR2 && (e.status === 0 || e.status === 403 || e.status === 408 || e.status === 429 || e.status >= 500))
  || (e instanceof ErroApi && (e.status === 0 || e.status === 429 || e.status === 503 || e.status >= 500));

export class Fila {
  itens: Item[] = [];
  private ativos = 0;
  private opcoes: Opcoes | null = null;
  private avisar: () => void;

  constructor(aoMudar: () => void) { this.avisar = aoMudar; }

  get ocupada() { return this.itens.some((i) => !["pronto", "duplicado", "erro", "cancelado"].includes(i.situacao)); }

  /** Põe arquivos na fila (ignora os repetidos e os de formato não aceito, que aparecem com erro). */
  adicionar(arquivos: File[], opcoes: Opcoes) {
    this.opcoes = opcoes;
    const ja = new Set(this.itens.filter((i) => i.situacao !== "erro" && i.situacao !== "cancelado").map((i) => i.chave));
    for (const arquivo of arquivos) {
      const chave = `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}`;
      if (ja.has(chave)) continue;
      ja.add(chave);
      const fmt = formatoDoArquivo(arquivo.name);
      const item: Item = { chave, arquivo, situacao: "fila", enviados: 0, conferidos: 0 };
      if (!fmt) Object.assign(item, { situacao: "erro", mensagem: "Formato não aceito." });
      else if (!arquivo.size) Object.assign(item, { situacao: "erro", mensagem: "Arquivo vazio." });
      // Um que já estava com erro ou cancelado sai da lista e entra de novo.
      this.itens = this.itens.filter((i) => i.chave !== chave);
      this.itens.push(item);
    }
    this.avisar();
    this.proximo();
  }

  tentarDeNovo(item: Item) {
    if (item.situacao !== "erro" && item.situacao !== "cancelado") return;
    Object.assign(item, { situacao: "fila", mensagem: undefined, enviados: 0, conferidos: 0 });
    this.avisar();
    this.proximo();
  }

  limparConcluidos() {
    this.itens = this.itens.filter((i) => !["pronto", "duplicado"].includes(i.situacao));
    this.avisar();
  }

  private proximo() {
    while (this.ativos < SIMULTANEOS) {
      const item = this.itens.find((i) => i.situacao === "fila");
      if (!item || !this.opcoes) return;
      this.ativos++;
      const controle = new AbortController();
      item.cancelar = () => controle.abort();
      item.situacao = "conferindo";
      this.enviar(item, this.opcoes, controle.signal)
        .catch((e) => {
          if (e instanceof Cancelado || controle.signal.aborted) {
            item.situacao = "cancelado";
            item.mensagem = undefined;
            if (item.id) api("envio", "POST", { acao: "cancelar", id: item.id }).catch(() => {});
          } else {
            item.situacao = "erro";
            item.mensagem = e instanceof ErroApi ? e.message : "Falha no envio. Tente de novo.";
          }
        })
        .finally(() => {
          item.cancelar = undefined;
          item.esperandoConexao = false;
          this.ativos--;
          this.avisar();
          this.proximo();
        });
    }
  }

  // Repete um passo enquanto o erro for de conexão (com espera crescente), parando se cancelarem.
  private async insistir<T>(item: Item, sinal: AbortSignal, passo: () => Promise<T>): Promise<T> {
    for (let t = 0; ; t++) {
      if (sinal.aborted) throw new Cancelado();
      try {
        const r = await passo();
        if (item.esperandoConexao) { item.esperandoConexao = false; this.avisar(); }
        return r;
      } catch (e) {
        if (e instanceof Cancelado || sinal.aborted) throw new Cancelado();
        if (!vale(e) || t >= TENTATIVAS) throw e;
        item.esperandoConexao = true;
        this.avisar();
        await esperarConexao(sinal);
        await dormir(ESPERAS[Math.min(t, ESPERAS.length - 1)], sinal);
      }
    }
  }

  private async enviar(item: Item, o: Opcoes, sinal: AbortSignal) {
    const a = item.arquivo;
    const fmt = formatoDoArquivo(a.name)!;

    // 1. Impressão digital.
    const sha = await sha256DoArquivo(a, (n) => { item.conferidos = n; this.avisar(); });
    if (sinal.aborted) throw new Cancelado();

    // 2. Iniciar (o servidor registra, ou devolve o que já chegou, ou diz que já existe).
    item.situacao = "preparando";
    this.avisar();
    let ini: Inicio;
    try {
      ini = await this.insistir(item, sinal, () => api<Inicio>("envio", "POST", {
        acao: "iniciar", evento_id: o.eventoId, nome: a.name, tamanho: a.size, sha256: sha, direito_uso: o.direito, autor: o.autor,
      }));
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409 && (e.codigo === "duplicado" || e.codigo === "duplicado_oculto" || e.codigo === "na_lixeira")) {
        item.situacao = "duplicado";
        item.mensagem = e.message;
        return;
      }
      throw e;
    }
    item.id = ini.arquivo.id;
    item.retomado = ini.retomada;
    let links = ini.links;
    const renovar = async (partes: number[] = []) => {
      const r = await api<{ partes: { numero: number; url: string }[]; links: Links }>("envio", "POST", { acao: "assinar", id: item.id, partes });
      links = r.links;
      return r.partes;
    };

    // 3. Prévias e dados (no navegador).
    const prep: Resultado = await prepararArquivo(a, fmt.tipo as "foto" | "video" | "raw", fmt.extensao);
    item.toca = prep.toca;
    if (prep.semPrevia) item.mensagem = prep.semPrevia;
    if (sinal.aborted) throw new Cancelado();

    // 4. O original.
    item.situacao = "enviando";
    this.avisar();
    let partesEnviadas: { numero: number; etag: string }[] | undefined;
    if (ini.arquivo.modo === "simples") {
      await this.insistir(item, sinal, async () => {
        if (!links.original) await renovar();
        try {
          await put(links.original!, a, (n) => { item.enviados = n; this.avisar(); }, sinal);
        } catch (e) {
          if (e instanceof FalhaR2 && e.status === 403) links.original = null; // link vencido: pede outro
          throw e;
        }
      });
      item.enviados = a.size;
    } else {
      partesEnviadas = await this.enviarPartes(item, ini, sinal, renovar);
    }

    // 5. Miniatura e foto grande (pequenas; se falharem, o arquivo fica sem prévia, mas fica).
    const sobe = async (qual: "miniatura" | "previa", blob?: Blob) => {
      if (!blob) return false;
      try {
        await this.insistir(item, sinal, async () => {
          if (!links[qual]) await renovar();
          try { await put(links[qual]!, blob, () => {}, sinal); } catch (e) {
            if (e instanceof FalhaR2 && e.status === 403) links[qual] = null;
            throw e;
          }
        });
        return true;
      } catch (e) {
        if (e instanceof Cancelado) throw e;
        return false;
      }
    };
    const miniatura = await sobe("miniatura", prep.miniatura);
    const previa = await sobe("previa", prep.previa);

    // 6. Concluir (o servidor confere o tamanho no R2).
    item.situacao = "concluindo";
    this.avisar();
    await this.insistir(item, sinal, () => api("envio", "POST", {
      acao: "concluir", id: item.id, partes: partesEnviadas, metadados: prep.metadados, miniatura, previa, toca: prep.toca,
    }));
    item.situacao = "pronto";
  }

  private async enviarPartes(item: Item, ini: Inicio, sinal: AbortSignal, renovar: (p: number[]) => Promise<{ numero: number; url: string }[]>) {
    const a = item.arquivo;
    const { parte_bytes: parte, total_partes: total } = ini.arquivo;
    const prontas = new Map(ini.arquivo.partes_prontas.map((p) => [p.numero, p.etag]));
    const emAndamento = new Map<number, number>(); // parte → bytes enviados agora
    const conta = () => {
      let n = 0;
      for (const num of prontas.keys()) { const f = faixaDaParte(num, parte!, a.size); n += f.fim - f.inicio; }
      for (const b of emAndamento.values()) n += b;
      item.enviados = n;
      this.avisar();
    };
    conta();
    const faltam = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !prontas.has(n));
    const urls = new Map<number, string>();
    const pegarUrl = async (n: number) => {
      if (!urls.has(n)) {
        const lote = faltam.filter((x) => x >= n && !prontas.has(x) && !urls.has(x)).slice(0, PARTES_POR_PEDIDO);
        for (const p of await renovar(lote.length ? lote : [n])) urls.set(p.numero, p.url);
      }
      return urls.get(n)!;
    };
    let fila = [...faltam];
    const trabalhador = async () => {
      for (let n = fila.shift(); n !== undefined; n = fila.shift()) {
        const num = n;
        const f = faixaDaParte(num, parte!, a.size);
        const etag = await this.insistir(item, sinal, async () => {
          const url = await pegarUrl(num);
          try {
            return await put(url, a.slice(f.inicio, f.fim), (b) => { emAndamento.set(num, b); conta(); }, sinal);
          } catch (e) {
            emAndamento.delete(num);
            if (e instanceof FalhaR2 && e.status === 403) urls.delete(num); // link vencido
            throw e;
          }
        });
        emAndamento.delete(num);
        if (!etag) throw new Error("O armazenamento não confirmou uma parte (ETag). Confira a configuração de CORS do bucket.");
        prontas.set(num, etag);
        conta();
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARTES_SIMULTANEAS, faltam.length) }, trabalhador));
    } finally {
      fila = [];
    }
    return [...prontas.entries()].sort((x, y) => x[0] - y[0]).map(([numero, etag]) => ({ numero, etag }));
  }
}
