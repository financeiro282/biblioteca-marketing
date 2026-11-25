import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../api";
import { enderecoCompleto, LIMITES_LINK, quando, VALIDADES_LINK } from "../lib/download";
import { AREA, Aviso, BOTAO, CAMPO, Campo, Janela, LISTA, cn } from "./ui";

// Criar link externo (Fase 4): Marketing e Administrador. Só vai arquivo com "Uso liberado" (no arquivo e no
// evento) — o servidor e o banco conferem. O endereço aparece UMA vez: o banco guarda só o sha256 do código.

type Criado = { endereco: string; incluidos: number; recusados: number; link: { expira_em: string } };

export function CriarLink({ ids, tituloInicial, onFechar }: { ids: string[]; tituloInicial: string; onFechar: () => void }) {
  const [titulo, setTitulo] = useState(tituloInicial.slice(0, LIMITES_LINK.titulo));
  const [destinatario, setDestinatario] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [dias, setDias] = useState(7);
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function criar(e?: FormEvent) {
    e?.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    setErros({});
    try {
      const r = await api<Criado>("links", "POST", { acao: "criar", titulo, destinatario, mensagem, dias, senha, ids });
      setCriado({ ...r, endereco: enderecoCompleto(r.endereco) });
    } catch (x) {
      const ex = x as ErroApi;
      if (ex.status === 401) return;
      setErro(ex.message);
      setErros(ex.erros ?? {});
    } finally {
      setEnviando(false);
    }
  }

  async function copiar() {
    if (!criado) return;
    try {
      await navigator.clipboard.writeText(criado.endereco);
      setCopiado(true);
    } catch {
      (document.getElementById("link-criado") as HTMLInputElement | null)?.select();
    }
  }

  if (criado) {
    return (
      <Janela aberta titulo="Link criado" onFechar={onFechar}
        rodape={<>
          <Link to="/links" className={cn(BOTAO.texto, "mr-auto")} onClick={onFechar}>Ver links externos</Link>
          <button type="button" className={BOTAO.contorno} onClick={onFechar}>Fechar</button>
        </>}>
        <div className="space-y-4 text-sm text-texto">
          <Aviso tom="alerta">Copie o link agora. Por segurança, ele não aparece de novo: se perder, revogue e crie outro.</Aviso>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="link-criado" readOnly value={criado.endereco} aria-label="Endereço do link" className={cn(CAMPO, "font-mono text-sm")}
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className={BOTAO.principal} onClick={copiar}>{copiado ? "Copiado" : "Copiar link"}</button>
          </div>
          <p>
            {criado.incluidos === 1 ? "1 arquivo" : `${criado.incluidos} arquivos`} no link, que vale até {quando(criado.link.expira_em)}.
            {senha ? " Mande a senha por outro canal, nunca junto com o link." : ""}
          </p>
          {criado.recusados > 0 && (
            <p className="text-secundario">
              {criado.recusados === 1 ? "1 arquivo ficou fora" : `${criado.recusados} arquivos ficaram fora`}: link externo só leva arquivo com "Uso liberado".
            </p>
          )}
        </div>
      </Janela>
    );
  }

  return (
    <Janela aberta titulo={ids.length === 1 ? "Link externo de 1 arquivo" : `Link externo de ${ids.length} arquivos`} onFechar={onFechar}
      rodape={<>
        <button type="button" className={BOTAO.texto} onClick={onFechar}>Cancelar</button>
        <button type="button" className={BOTAO.principal} disabled={enviando || !titulo.trim()} onClick={() => criar()}>{enviando ? "Criando…" : "Criar link"}</button>
      </>}>
      <form onSubmit={criar} className="space-y-4">
        <p className="text-sm text-secundario">Para agência ou imprensa. Só vai arquivo com "Uso liberado" no arquivo e no evento; os outros ficam fora.</p>
        <Campo id="link-titulo" rotulo="Título" ajuda={erros.titulo ?? "Aparece no alto da página do link."}>
          <input id="link-titulo" className={CAMPO} value={titulo} maxLength={LIMITES_LINK.titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <Campo id="link-para" rotulo="Para quem (opcional)" ajuda={erros.destinatario ?? "Só para a equipe saber depois. Não aparece para quem abre."}>
          <input id="link-para" className={CAMPO} value={destinatario} maxLength={LIMITES_LINK.destinatario} placeholder="Ex.: Agência X"
            onChange={(e) => setDestinatario(e.target.value)} />
        </Campo>
        <Campo id="link-mensagem" rotulo="Mensagem (opcional)" ajuda={erros.mensagem ?? "Aparece para quem abre o link."}>
          <textarea id="link-mensagem" className={AREA} value={mensagem} maxLength={LIMITES_LINK.mensagem} onChange={(e) => setMensagem(e.target.value)} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="link-dias" rotulo="Validade" ajuda={erros.dias}>
            <select id="link-dias" className={cn(LISTA, "sm:w-full")} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {VALIDADES_LINK.map((d: number) => <option key={d} value={d}>{d === 1 ? "1 dia" : `${d} dias`}</option>)}
            </select>
          </Campo>
          <Campo id="link-senha" rotulo="Senha (opcional)" ajuda={erros.senha ?? `De ${LIMITES_LINK.senhaMin} a ${LIMITES_LINK.senhaMax} caracteres.`}>
            <input id="link-senha" className={CAMPO} value={senha} maxLength={LIMITES_LINK.senhaMax} autoComplete="off" spellCheck={false}
              onChange={(e) => setSenha(e.target.value)} />
          </Campo>
        </div>
        {erros.ids && <Aviso tom="erro">{erros.ids}</Aviso>}
        {erro && !Object.keys(erros).length && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}
