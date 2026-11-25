import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { ConfirmarLixeira } from "../componentes/EdicaoEmLote";
import { AREA, Aviso, BOTAO, CAMPO, Campo, Carregando, cn } from "../componentes/ui";
import { DIREITOS, LIMITES, direitoFicouMaisAberto, lerEvento, pode, resumoDoEvento, type Direito, type Evento } from "../lib/dominio";

// Novo evento (/evento/novo) e Editar evento (/evento/:id/editar) — Marketing e Administrador.
// Adiantado da Fase 3 em 25/11/2026 (o envio precisa de um evento). Os campos e os avisos seguem
// compartilhado/evento.js, a MESMA regra que o servidor usa para gravar.
// O direito de uso não vem marcado no evento novo: é escolhido sempre (ninguém libera um evento por descuido).

type Form = { nome: string; data_evento: string; local: string; responsavel: string; descricao: string; tags: string; direito_uso: Direito | "" };

const doEvento = (e: Evento): Form => ({
  nome: e.nome, data_evento: e.data_evento, local: e.local ?? "", responsavel: e.responsavel ?? "",
  descricao: e.descricao ?? "", tags: e.tags.join(", "), direito_uso: e.direito_uso,
});

// O que cada direito quer dizer, em uma linha (quem vê e o que pode).
const EXPLICA: Record<Direito, string> = {
  liberado: "Todos veem e baixam. Pode ser usado fora da empresa e enviado por link externo.",
  interno: "Todos veem e baixam, só para uso dentro da Importek. Não vai por link externo.",
  sem_autorizacao: "Só o Marketing e o Administrador veem (ex.: termos de imagem pendentes).",
};

export default function EventoFormulario({ modo }: { modo: "novo" | "editar" }) {
  const { id = "" } = useParams();
  const { eu, avisar } = useApp();
  const navegar = useNavigate();
  const [original, setOriginal] = useState<Evento | null>(null);
  const [f, setF] = useState<Form>({ nome: "", data_evento: "", local: "", responsavel: eu.nome, descricao: "", tags: "", direito_uso: "" });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [lixeira, setLixeira] = useState(false);

  useEffect(() => {
    if (modo !== "editar") return;
    let vivo = true;
    api<{ evento: Evento }>(`eventos?id=${encodeURIComponent(id)}`)
      .then((r) => { if (vivo) { setOriginal(r.evento); setF(doEvento(r.evento)); } })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErroCarga(e.status === 404 ? "Evento não encontrado, ou você não tem acesso a ele." : e.message); });
    return () => { vivo = false; };
  }, [modo, id]);

  const mudar = (campo: keyof Form, valor: string) => {
    setF((x) => ({ ...x, [campo]: valor }));
    if (erros[campo]) setErros((x) => { const y = { ...x }; delete y[campo]; return y; });
  };

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (salvando) return;
    const r = lerEvento(f);
    if (r.erros) {
      setErros(r.erros);
      setErroGeral(null);
      document.getElementById(`ev-${Object.keys(r.erros)[0]}`)?.focus();
      return;
    }
    setSalvando(true);
    setErros({});
    setErroGeral(null);
    try {
      if (modo === "novo") {
        const { evento } = await api<{ evento: { id: string } }>("eventos", "POST", { acao: "criar", evento: r.valores });
        avisar("Evento criado.");
        navegar(`/evento/${evento.id}`, { replace: true });
      } else {
        await api("eventos", "POST", { acao: "alterar", id, versao: original?.versao, evento: r.valores });
        avisar("Evento salvo.");
        navegar(`/evento/${id}`, { replace: true });
      }
    } catch (e) {
      const x = e as ErroApi;
      if (x.status === 401) return;
      if (x.erros) setErros(x.erros);
      setErroGeral(x.message);
      setSalvando(false);
    }
  }

  const voltarPara = modo === "editar" ? `/evento/${id}` : "/";
  const voltar = <Link to={voltarPara} className={`${BOTAO.texto} mb-3`}>{modo === "editar" ? "Voltar para o evento" : "Voltar para eventos"}</Link>;
  if (erroCarga) return <>{voltar}<Aviso tom="erro">{erroCarga}</Aviso></>;
  if (modo === "editar" && !original) return <Carregando />;

  // Abrir o direito muda o que outras pessoas veem: o aviso aparece antes de salvar.
  const abriu = original && f.direito_uso && direitoFicouMaisAberto(original.direito_uso, f.direito_uso);
  const erroDe = (campo: string) => (erros[campo] ? <span className="text-erro-texto">{erros[campo]}</span> : undefined);

  return (
    <>
      <Cabecalho antes={voltar} titulo={modo === "novo" ? "Novo evento" : "Editar evento"} />
      <form onSubmit={salvar} noValidate className="max-w-2xl space-y-5">
        <Campo id="ev-nome" rotulo="Nome do evento" ajuda={erroDe("nome")}>
          <input id="ev-nome" className={cn(CAMPO, erros.nome && "border-erro-texto")} value={f.nome} maxLength={LIMITES.nome}
            onChange={(e) => mudar("nome", e.target.value)} aria-invalid={!!erros.nome} autoFocus={modo === "novo"} />
        </Campo>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <Campo id="ev-data_evento" rotulo="Data" ajuda={erroDe("data_evento")}>
            <input id="ev-data_evento" type="date" min="1990-01-01" max="2100-12-31" className={cn(CAMPO, erros.data_evento && "border-erro-texto")}
              value={f.data_evento} onChange={(e) => mudar("data_evento", e.target.value)} aria-invalid={!!erros.data_evento} />
          </Campo>
          <Campo id="ev-local" rotulo="Local" ajuda={erroDe("local") ?? "Opcional. Ex.: São Paulo/SP"}>
            <input id="ev-local" className={CAMPO} value={f.local} maxLength={LIMITES.local} onChange={(e) => mudar("local", e.target.value)} />
          </Campo>
        </div>

        <Campo id="ev-responsavel" rotulo="Responsável" ajuda={erroDe("responsavel") ?? "Opcional. Pessoa ou área que cuida do evento."}>
          <input id="ev-responsavel" className={CAMPO} value={f.responsavel} maxLength={LIMITES.responsavel} onChange={(e) => mudar("responsavel", e.target.value)} />
        </Campo>

        <Campo id="ev-descricao" rotulo="Descrição" ajuda={erroDe("descricao") ?? "Opcional."}>
          <textarea id="ev-descricao" className={AREA} rows={4} value={f.descricao} maxLength={LIMITES.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
        </Campo>

        <Campo id="ev-tags" rotulo="Tags" ajuda={erroDe("tags") ?? "Opcional. Separe por vírgula. Ex.: feira, estande, joelho"}>
          <input id="ev-tags" className={cn(CAMPO, erros.tags && "border-erro-texto")} value={f.tags} onChange={(e) => mudar("tags", e.target.value)} aria-invalid={!!erros.tags} />
        </Campo>

        <fieldset className="space-y-2" aria-describedby={erros.direito_uso ? "ev-direito-erro" : undefined}>
          <legend className="mb-1.5 block text-sm font-semibold text-titulo">Direito de uso</legend>
          <p className="text-xs text-secundario">Vale para todos os arquivos do evento. Um arquivo pode ter um direito mais restrito; vale sempre o mais restrito.</p>
          {DIREITOS.map((d) => (
            <label key={d.codigo} className={cn("flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5",
              f.direito_uso === d.codigo ? "border-titulo bg-zebra" : "border-borda bg-superficie hover:border-borda-campo")}>
              <input type="radio" name="direito_uso" value={d.codigo} checked={f.direito_uso === d.codigo}
                id={d.codigo === "liberado" ? "ev-direito_uso" : undefined}
                onChange={() => mudar("direito_uso", d.codigo)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--cor-titulo)]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-titulo">{d.rotulo}</span>
                <span className="block text-sm text-texto">{EXPLICA[d.codigo as Direito]}</span>
              </span>
            </label>
          ))}
          {erros.direito_uso && <p id="ev-direito-erro" className="text-xs text-erro-texto">{erros.direito_uso}</p>}
        </fieldset>

        {abriu && original && (
          <Aviso tom="alerta">
            {original.direito_uso === "sem_autorizacao"
              ? "Ao salvar, o Colaborador passa a ver este evento e os arquivos dele (menos os que têm direito próprio mais restrito)."
              : "Ao salvar, os arquivos deste evento passam a poder ser usados fora da empresa e enviados por link externo (menos os que têm direito próprio mais restrito)."}
          </Aviso>
        )}
        {erroGeral && <Aviso tom="erro">{erroGeral}</Aviso>}

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button type="submit" className={BOTAO.principal} disabled={salvando}>
            {salvando ? "Salvando…" : modo === "novo" ? "Criar evento" : "Salvar alterações"}
          </button>
          <Link to={voltarPara} className={BOTAO.texto}>Cancelar</Link>
        </div>
      </form>

      {/* Lixeira do evento (Marketing/Admin): separada do formulário, com confirmação. */}
      {modo === "editar" && original && pode(eu.perfil, "excluir") && (
        <section className="mt-10 max-w-2xl border-t border-borda pt-5">
          <h2 className="text-sm font-semibold text-titulo">Mandar o evento para a lixeira</h2>
          <p className="mt-1 text-sm text-secundario">O evento e todos os arquivos dele somem das listas e da busca. O Administrador pode restaurar em até 30 dias.</p>
          <button type="button" className={cn(BOTAO.texto, "mt-2 text-erro-texto")} onClick={() => setLixeira(true)}>Mandar para a lixeira</button>
        </section>
      )}
      {lixeira && original && (
        <ConfirmarLixeira
          titulo="Mandar o evento para a lixeira?"
          texto={<p><span className="font-semibold text-titulo">{original.nome}</span> ({resumoDoEvento(original)}) some das listas e da busca na hora, com todos os arquivos.</p>}
          onFechar={() => setLixeira(false)}
          onConfirmar={async () => {
            await api("eventos", "POST", { acao: "lixeira", id });
            avisar("Evento na lixeira.");
            navegar("/", { replace: true });
          }}
        />
      )}
    </>
  );
}
