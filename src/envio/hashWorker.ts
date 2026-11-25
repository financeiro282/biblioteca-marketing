// Impressão digital (SHA-256) de arquivo GRANDE, fora da página (Web Worker), lendo 8 MB por vez: o navegador só
// calcula SHA-256 nativo com o arquivo inteiro na memória, e um vídeo de vários GB travaria a aba.
// Biblioteca @noble/hashes (JavaScript puro, sem WebAssembly: funciona com o CSP do Portal) — aprovada em 25/11/2026.
// Este arquivo vira um script próprio do site (/biblioteca/assets/…): o CSP "worker-src 'self'" já permite.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const PEDACO = 8 * 1024 * 1024;
const ctx = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent<{ arquivo: File }>) => void) | null };

ctx.onmessage = async (e) => {
  const { arquivo } = e.data;
  try {
    const h = sha256.create();
    for (let i = 0; i < arquivo.size; i += PEDACO) {
      h.update(new Uint8Array(await arquivo.slice(i, Math.min(i + PEDACO, arquivo.size)).arrayBuffer()));
      ctx.postMessage({ lidos: Math.min(i + PEDACO, arquivo.size) });
    }
    ctx.postMessage({ sha256: bytesToHex(h.digest()) });
  } catch (erro) {
    ctx.postMessage({ erro: String((erro as Error)?.message || erro) });
  }
};
