import { useEffect, useState, type FormEvent } from "react";
import { BASE } from "../api";
import { Aviso, BOTAO, CAMPO, Campo, Carregando, Etiqueta, Janela } from "../componentes/ui";
import { formatoDoCodigo, iniciarDownload, quando } from "../lib/download";
import { duracaoLegivel, tamanhoLegivel } from "../lib/dominio";

// Página do LINK EXTERNO (Fase 4): quem abre é agência ou imprensa, SEM conta no Portal e sem login.
// O código vem depois do # (não vai para servidor nem fica em log). Tudo é conferido pelo banco a cada pedido
// (api/externo.js): validade, revogação, senha e o direito de cada arquivo. A senha certa fica só na memória
// desta página (para os downloads), nunca no navegador.

type Arq = {
  id: string; tipo: "foto" | "video" | "raw"; nome: string; extensao: string; tamanho_bytes: number;
  largura: number | null; altura: number | null; duracao_seg: number | null; legenda: string | null; autor: string | null;
  miniatura_url: string | null; previa_url: string | null;
};
type Resposta = {
  situacao: "ok" | "senha" | "senha_errada" | "bloqueado" | "expirado" | "revogado" | "nao_encontrado" | "arquivo_fora";
  titulo?: string; mensagem?: string | null; expira_em?: string; arquivos?: Arq[]; restantes?: number; ate?: string; url?: string; erro?: string;
};

async function chamar(corpo: Record<string, unknown>): Promise<Resposta> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/api/externo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), cache: "no-store", credentials: "omit",
    });
  } catch {
    throw new Error("Sem conexão. Verifique a internet e tente de novo.");
  }
  const j = await r.json().catch(() => ({}));
  if (j?.situacao) return j as Resposta;
  throw new Error(j?.erro || "Não foi possível abrir o link agora. Tente de novo em instantes.");
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const horaBR = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "");

export default function LinkExterno() {
  const [codigo] = useState(() => window.location.hash.slice(1));
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [senhaCerta, setSenhaCerta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState<Arq | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [todos, setTodos] = useState<{ feito: number; total: number } | null>(null);

  async function abrir(s: string | null) {
    setErro(null);
    try {
      const resp = await chamar({ acao: "abrir", codigo, ...(s ? { senha: s } : {}) });
      setR(resp);
      if (resp.situacao === "ok") setSenhaCerta(s);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  useEffect(() => {
    document.title = "Arquivos da Importek";
    if (!formatoDoCodigo(codigo)) setR({ situacao: "nao_encontrado" });
    else abrir(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!senha || enviando) return;
    setEnviando(true);
    await abrir(senha);
    setEnviando(false);
  }

  async function baixar(a: Arq): Promise<boolean> {
    setBaixando(a.id);
    try {
      const resp = await chamar({ acao: "baixar", codigo, arquivo_id: a.id, ...(senhaCerta ? { senha: senhaCerta } : {}) });
      if (resp.situacao === "ok" && resp.url) { iniciarDownload(resp.url); return true; }
      if (resp.situacao === "arquivo_fora") { setErro(`"${a.nome}" não está mais disponível neste link.`); await abrir(senhaCerta); return false; }
      setR(resp);
      return false;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    } finally {
      setBaixando(null);
    }
  }

  async function baixarTodos(lista: Arq[]) {
    setTodos({ feito: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      if (!(await baixar(lista[i]))) break;
      setTodos({ feito: i + 1, total: lista.length });
      await espera(1200);      // um de cada vez: o navegador não perde nenhum
    }
    setTodos(null);
  }

  const arquivos = r?.arquivos ?? [];
  const total = arquivos.reduce((s, a) => s + a.tamanho_bytes, 0);

  return (
    <div className="min-h-screen bg-fundo">
      <header className="border-b border-borda bg-superficie">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src={`${import.meta.env.BASE_URL}logo-importek-cor.png`} alt="Importek" width={150} height={47} className="h-7 w-auto" />
          <span className="text-sm text-secundario">Arquivos compartilhados</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        {erro && <div className="mb-4"><Aviso tom="erro">{erro}</Aviso></div>}
        {!r && !erro && <Carregando />}
        {r?.situacao === "nao_encontrado" && <Aviso tom="erro">Link não encontrado. Confira se o endereço foi copiado inteiro, inclusive o que vem depois do #.</Aviso>}
        {r?.situacao === "expirado" && <Aviso>Este link venceu. Peça um novo a quem enviou.</Aviso>}
        {r?.situacao === "revogado" && <Aviso>Este link foi cancelado por quem enviou.</Aviso>}
        {r?.situacao === "bloqueado" && <Aviso tom="alerta">Muitas tentativas de senha. Tente de novo depois das {horaBR(r.ate)}.</Aviso>}
        {(r?.situacao === "senha" || r?.situacao === "senha_errada") && (
          <form onSubmit={entrar} className="mx-auto max-w-sm rounded-grande border border-borda bg-superficie p-5">
            <h1 className="mb-1 text-lg font-bold text-titulo">Este link tem senha</h1>
            <p className="mb-4 text-sm text-secundario">Quem enviou o link passa a senha por outro canal.</p>
            <Campo id="senha" rotulo="Senha" ajuda={r.situacao === "senha_errada" ? `Senha errada. ${r.restantes === 1 ? "Resta 1 tentativa" : `Restam ${r.restantes} tentativas`}.` : undefined}>
              <input id="senha" type="password" className={CAMPO} value={senha} autoComplete="off" autoFocus maxLength={100} onChange={(e) => setSenha(e.target.value)} />
            </Campo>
            <button type="submit" className={`${BOTAO.principal} mt-4 w-full`} disabled={!senha || enviando}>{enviando ? "Conferindo…" : "Abrir"}</button>
          </form>
        )}
        {r?.situacao === "ok" && (
          <>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-bold text-titulo">{r.titulo}</h1>
                <p className="mt-1 text-sm text-secundario">
                  {arquivos.length === 1 ? "1 arquivo" : `${arquivos.length} arquivos`} · {tamanhoLegivel(total)} · Disponível até {quando(r.expira_em)}
                </p>
              </div>
              {arquivos.length > 1 && (
                <button type="button" className={BOTAO.principal} disabled={!!todos} onClick={() => baixarTodos(arquivos)}>
                  {todos ? `Baixando ${todos.feito + 1} de ${todos.total}…` : `Baixar todos (${arquivos.length})`}
                </button>
              )}
            </div>
            {r.mensagem && <p className="mb-6 max-w-3xl whitespace-pre-line rounded border border-borda bg-superficie px-4 py-3 text-sm leading-relaxed text-texto">{r.mensagem}</p>}
            {arquivos.length > 1 && <p className="mb-4 text-xs text-secundario">Ao baixar todos, o navegador pode pedir permissão para baixar vários arquivos.</p>}
            {arquivos.length === 0 && <Aviso>Nenhum arquivo disponível neste link no momento.</Aviso>}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {arquivos.map((a) => (
                <li key={a.id} className="min-w-0">
                  <button type="button" onClick={() => setAberto(a)} title={a.nome}
                    className="relative block aspect-square w-full overflow-hidden rounded border border-borda bg-zebra hover:border-titulo focus-visible:border-titulo focus-visible:outline-none">
                    {a.miniatura_url
                      ? <img src={a.miniatura_url} alt={a.legenda || a.nome} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      : <span className="flex h-full items-center justify-center text-xs font-semibold text-secundario">{a.extensao.toUpperCase()}</span>}
                    {a.tipo !== "foto" && (
                      <span className="absolute bottom-1.5 right-1.5">
                        <Etiqueta>{a.tipo === "video" ? `Vídeo${a.duracao_seg ? ` ${duracaoLegivel(a.duracao_seg)}` : ""}` : "RAW"}</Etiqueta>
                      </span>
                    )}
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-secundario" title={a.nome}>{a.nome} · {tamanhoLegivel(a.tamanho_bytes)}</span>
                    <button type="button" className={`${BOTAO.texto} text-xs`} disabled={baixando === a.id || !!todos} onClick={() => baixar(a)}>
                      {baixando === a.id ? "Abrindo…" : "Baixar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-10 text-center text-xs text-secundario">Importek · Use os arquivos conforme combinado com quem enviou o link.</p>
      </main>
      {aberto && (
        <Janela aberta titulo={aberto.nome} largura="max-w-4xl" onFechar={() => setAberto(null)}
          rodape={<button type="button" className={BOTAO.principal} disabled={baixando === aberto.id} onClick={() => baixar(aberto)}>
            {baixando === aberto.id ? "Abrindo…" : `Baixar original (${tamanhoLegivel(aberto.tamanho_bytes)})`}
          </button>}>
          <div className="space-y-3">
            <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded border border-borda bg-zebra">
              {aberto.previa_url || aberto.miniatura_url
                ? <img src={aberto.previa_url || aberto.miniatura_url || ""} alt={aberto.legenda || aberto.nome} className="max-h-[60vh] w-full object-contain" />
                : <p className="p-6 text-sm text-secundario">Sem prévia. Baixe o original para ver.</p>}
            </div>
            {aberto.tipo === "video" && <p className="text-sm text-secundario">Vídeo{aberto.duracao_seg ? ` de ${duracaoLegivel(aberto.duracao_seg)}` : ""}: baixe para assistir.</p>}
            {aberto.legenda && <p className="text-sm text-texto">{aberto.legenda}</p>}
            {aberto.autor && <p className="text-sm text-secundario">Autor: {aberto.autor}</p>}
          </div>
        </Janela>
      )}
    </div>
  );
}
