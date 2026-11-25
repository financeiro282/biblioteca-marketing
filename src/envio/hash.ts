// SHA-256 do arquivo (duplicados): até 128 MB pelo navegador (nativo, rápido); acima, no Worker, por pedaços.

const LIMITE_NATIVO = 128 * 1024 * 1024;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256DoArquivo(arquivo: File, aoProgresso?: (lidos: number) => void): Promise<string> {
  if (arquivo.size <= LIMITE_NATIVO) {
    const r = hex(await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer()));
    aoProgresso?.(arquivo.size);
    return r;
  }
  const w = new Worker(new URL("./hashWorker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<string>((ok, falha) => {
      w.onmessage = (e: MessageEvent<{ lidos?: number; sha256?: string; erro?: string }>) => {
        if (e.data.lidos !== undefined) aoProgresso?.(e.data.lidos);
        if (e.data.sha256) ok(e.data.sha256);
        if (e.data.erro) falha(new Error(e.data.erro));
      };
      w.onerror = (e) => falha(new Error(e.message || "Não foi possível ler o arquivo."));
      w.postMessage({ arquivo });
    });
  } finally {
    w.terminate();
  }
}
