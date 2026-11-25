import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../App";
import { direitosDoPerfil, TIPOS } from "../lib/dominio";
import { CAMPO, LISTA, BOTAO } from "./ui";

// Barra de busca e filtros. O estado fica no ENDEREÇO (?q=…&tipo=…): dá para voltar, recarregar e mandar o link.
// O texto só vai para o endereço ao "Buscar" (Enter); as listas mudam na hora.

export type OpcoesFiltro = { busca?: string; tipo?: boolean; ano?: boolean; direito?: boolean; anos?: number[] };

export function Filtros({ opcoes }: { opcoes: OpcoesFiltro }) {
  const [params, setParams] = useSearchParams();
  const { eu } = useApp();
  const [texto, setTexto] = useState(params.get("q") ?? "");
  useEffect(() => setTexto(params.get("q") ?? ""), [params]);

  const mudar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params);
    if (valor) novo.set(chave, valor); else novo.delete(chave);
    novo.delete("pagina");
    setParams(novo, { replace: chave !== "q" });
  };
  const algum = ["q", "tipo", "ano", "direito"].some((k) => params.get(k));
  const anoAtual = new Date().getFullYear();
  const anos = opcoes.anos?.length ? opcoes.anos : Array.from({ length: 8 }, (_, i) => anoAtual - i);

  return (
    <form
      role="search"
      className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      onSubmit={(e) => { e.preventDefault(); mudar("q", texto.trim()); }}
    >
      {opcoes.busca !== undefined && (
        <div className="min-w-0 flex-1 sm:min-w-[260px]">
          <label htmlFor="f-q" className="mb-1.5 block text-sm font-semibold text-titulo">Buscar</label>
          <div className="flex gap-2">
            <input id="f-q" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={opcoes.busca} className={CAMPO} maxLength={100} />
            <button type="submit" className={BOTAO.contorno}>Buscar</button>
          </div>
        </div>
      )}
      {opcoes.tipo && (
        <Lista id="f-tipo" rotulo="Tipo" valor={params.get("tipo") ?? ""} aoMudar={(v) => mudar("tipo", v)}
          opcoes={[["", "Todos"], ...TIPOS.map((t) => [t.codigo, t.rotulo] as [string, string])]} />
      )}
      {opcoes.ano && (
        <Lista id="f-ano" rotulo="Ano" valor={params.get("ano") ?? ""} aoMudar={(v) => mudar("ano", v)}
          opcoes={[["", "Todos"], ...anos.map((a) => [String(a), String(a)] as [string, string])]} />
      )}
      {opcoes.direito && (
        <Lista id="f-direito" rotulo="Direito de uso" valor={params.get("direito") ?? ""} aoMudar={(v) => mudar("direito", v)}
          opcoes={[["", "Todos"], ...direitosDoPerfil(eu.perfil).map((d) => [d.codigo, d.rotulo] as [string, string])]} />
      )}
      {algum && (
        <button type="button" className={`${BOTAO.texto} sm:mb-2.5`} onClick={() => { setTexto(""); setParams(new URLSearchParams(), { replace: true }); }}>
          Limpar filtros
        </button>
      )}
    </form>
  );
}

function Lista({ id, rotulo, valor, opcoes, aoMudar }: {
  id: string; rotulo: string; valor: string; opcoes: [string, string][]; aoMudar: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-titulo">{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} className={LISTA}>
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </div>
  );
}
