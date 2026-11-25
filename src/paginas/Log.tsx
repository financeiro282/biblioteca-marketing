import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, BASE, comFiltros, ErroApi } from "../api";
import { Cabecalho } from "../componentes/Layout";
import { Aviso, BOTAO, CAMPO, Campo, Carregando, LISTA, cn } from "../componentes/ui";
import { ACOES_DO_LOG, rotuloDaAcao, type LinhaDoLog } from "../lib/controle";
import { quando } from "../lib/download";

// Log de ações (Fase 5): só o Administrador. Quem enviou, baixou, compartilhou, mandou para a lixeira, restaurou e
// apagou, e quando. Visitante de link externo e a rotina diária aparecem sem e-mail. "Baixar CSV" leva os filtros.

const GRUPOS = [["arquivo.", "Arquivos (todas)"], ["evento.", "Eventos (todas)"], ["zip.", "Zips (todas)"], ["link.", "Links externos (todas)"]];

function alvo(l: LinhaDoLog) {
  const nome = typeof l.detalhes?.nome === "string" ? l.detalhes.nome : null;
  if (nome) return nome;
  if (typeof l.detalhes?.quantos === "number") return `${l.detalhes.quantos} arquivos`;
  return l.alvo_id ? `${l.alvo_tipo ?? ""} ${l.alvo_id.slice(0, 8)}`.trim() : "";
}

export default function Log() {
  const [params, setParams] = useSearchParams();
  const filtros = { acao: params.get("acao") ?? "", pessoa: params.get("pessoa") ?? "", de: params.get("de") ?? "", ate: params.get("ate") ?? "" };
  const pagina = Number(params.get("pagina")) || 1;
  const [form, setForm] = useState(filtros);
  const [r, setR] = useState<{ linhas: LinhaDoLog[]; total: number; por_pagina: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = params.toString();

  useEffect(() => {
    let vivo = true;
    setR(null);
    api<{ linhas: LinhaDoLog[]; total: number; por_pagina: number }>(comFiltros("controle", { rota: "log", ...filtros, pagina }))
      .then((x) => { if (vivo) { setR(x); setErro(null); } })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErro(e.message); });
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };
  const ir = (n: number) => setParams({ ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)), pagina: String(n) });
  const paginas = r ? Math.max(1, Math.ceil(r.total / r.por_pagina)) : 1;
  const csv = `${BASE}/api/${comFiltros("controle", { rota: "log", csv: 1, ...filtros })}`;

  return (
    <>
      <Cabecalho titulo="Log de ações" acoes={<a href={csv} className={BOTAO.contorno}>Baixar CSV</a>}>
        <p className="mt-2 max-w-3xl text-sm text-secundario">Tudo o que muda ou sai da biblioteca. O CSV leva os filtros escolhidos (até 10.000 linhas) e abre no Excel.</p>
      </Cabecalho>
      <form onSubmit={aplicar} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto] lg:items-end">
        <Campo id="log-acao" rotulo="Ação">
          <select id="log-acao" className={cn(LISTA, "sm:w-full")} value={form.acao} onChange={(e) => setForm({ ...form, acao: e.target.value })}>
            <option value="">Todas</option>
            {GRUPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            {Object.entries(ACOES_DO_LOG).map(([v, t]) => <option key={v} value={v}>{t as string}</option>)}
          </select>
        </Campo>
        <Campo id="log-pessoa" rotulo="Pessoa">
          <input id="log-pessoa" className={CAMPO} value={form.pessoa} placeholder="Nome ou e-mail" onChange={(e) => setForm({ ...form, pessoa: e.target.value })} />
        </Campo>
        <Campo id="log-de" rotulo="De"><input id="log-de" type="date" className={CAMPO} value={form.de} onChange={(e) => setForm({ ...form, de: e.target.value })} /></Campo>
        <Campo id="log-ate" rotulo="Até"><input id="log-ate" type="date" className={CAMPO} value={form.ate} onChange={(e) => setForm({ ...form, ate: e.target.value })} /></Campo>
        <button type="submit" className={BOTAO.principal}>Filtrar</button>
      </form>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!erro && !r && <Carregando />}
      {r && r.linhas.length === 0 && <Aviso>Nenhuma ação encontrada.</Aviso>}
      {r && r.linhas.length > 0 && (
        <>
          <p className="mb-2 text-sm text-secundario">{r.total.toLocaleString("pt-BR")} {r.total === 1 ? "ação" : "ações"}</p>
          <ul className="divide-y divide-borda rounded-grande border border-borda bg-superficie">
            {r.linhas.map((l) => (
              <li key={l.id} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.3fr)]">
                <span className="text-secundario pi-num">{quando(l.em)}</span>
                <span className="min-w-0 truncate text-titulo" title={l.email ?? undefined}>
                  {l.nome || l.email || (l.acao.startsWith("link.") ? "Visitante do link" : "Rotina diária")}
                </span>
                <span className="min-w-0">
                  <span className="font-semibold text-titulo">{rotuloDaAcao(l.acao)}</span>
                  {alvo(l) && <span className="text-secundario"> · {alvo(l)}</span>}
                  {l.ip && <span className="text-secundario"> · IP {l.ip}</span>}
                </span>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <button type="button" className={BOTAO.texto} disabled={pagina <= 1} onClick={() => ir(pagina - 1)}>Anterior</button>
              <span className="text-sm text-secundario pi-num">Página {pagina} de {paginas}</span>
              <button type="button" className={BOTAO.texto} disabled={pagina >= paginas} onClick={() => ir(pagina + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
