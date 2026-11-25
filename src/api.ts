// Conversa com o servidor do próprio sistema (/biblioteca/api/...). O navegador NUNCA fala com o banco nem com o
// R2 com chave. A sessão vai num cookie httpOnly que esta página não enxerga; sem ela (401), a pessoa vai ao Portal,
// que confere o acesso e devolve com um passe.

export const PORTAL_URL = (import.meta.env.VITE_PORTAL_URL || "https://portal-importek.vercel.app").replace(/\/+$/, "");
export const SLUG = "biblioteca";

export class ErroApi extends Error {
  // `erros`: campo → frase curta (formulários; ex.: { nome: "Informe o nome do evento." }).
  constructor(mensagem: string, public status: number, public codigo?: string, public erros?: Record<string, string>) { super(mensagem); }
}

// Ida ao Portal com freio: voltou de lá há menos de 1 min e ainda sem sessão (cookie bloqueado, por exemplo) →
// mostra o erro em vez de ficar em ciclo.
const CHAVE_IDA = "bib:ida-portal";
// ENDEREÇO ÚNICO: o site mora em /biblioteca/ (dentro do Portal). O "volta" que vai e vem do Portal é o caminho
// DENTRO do sistema ("/evento/…") — o prefixo só entra aqui.
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, ""); // "/biblioteca"
export const caminhoNoApp = () => {
  const p = window.location.pathname;
  return (p === BASE || p.startsWith(`${BASE}/`) ? p.slice(BASE.length) : p) || "/";
};
export const urlNoApp = (c: string) => `${BASE}${c.startsWith("/") ? c : `/${c}`}`;

export function irAoPortal(volta = caminhoNoApp() + window.location.search): boolean {
  let ultima = 0;
  try { ultima = Number(sessionStorage.getItem(CHAVE_IDA)) || 0; } catch { /* sem armazenamento */ }
  if (Date.now() - ultima < 60_000) return false;
  try { sessionStorage.setItem(CHAVE_IDA, String(Date.now())); } catch { /* sem armazenamento */ }
  window.location.replace(`${PORTAL_URL}/abrir/${SLUG}?volta=${encodeURIComponent(volta)}`);
  return true;
}
export function limparIdaAoPortal() {
  try { sessionStorage.removeItem(CHAVE_IDA); } catch { /* sem armazenamento */ }
}

export async function api<T>(caminho: string, metodo: "GET" | "POST" = "GET", corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/api/${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ErroApi("Sem conexão com o servidor. Verifique a internet e tente de novo.", 0);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && j.codigo === "sem_sessao") irAoPortal();
    throw new ErroApi(j.erro || "Não foi possível falar com o servidor.", r.status, j.codigo, j.erros);
  }
  return j as T;
}

/** Monta a busca (?q=…&tipo=…) só com o que tem valor. */
export function comFiltros(caminho: string, filtros: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    p.set(k, v === true ? "1" : String(v));
  }
  const s = p.toString();
  return s ? `${caminho}?${s}` : caminho;
}
