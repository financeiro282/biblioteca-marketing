import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, comFiltros, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { Filtros } from "../componentes/Filtros";
import { Aviso, BOTAO, Carregando, Status } from "../componentes/ui";
import { dataCurta, pode, resumoDoEvento, rotuloDoDireito, tomDoDireito, type Evento } from "../lib/dominio";

// Página inicial: os eventos (álbuns), do mais recente para o mais antigo, com busca e filtros.
export default function Eventos() {
  const { eu } = useApp();
  const [params] = useSearchParams();
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = params.toString();

  useEffect(() => {
    let vivo = true;
    setEventos(null);
    setErro(null);
    api<{ eventos: Evento[] }>(comFiltros("eventos", { q: params.get("q"), ano: params.get("ano"), direito: params.get("direito") }))
      .then((r) => { if (vivo) setEventos(r.eventos); })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErro(e.message); });
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Cabecalho
        titulo="Eventos"
        acoes={pode(eu.perfil, "organizar") ? <Link to="/evento/novo" className={BOTAO.principal}>Novo evento</Link> : undefined}
      />
      <Filtros opcoes={{ busca: "Nome, local, tag ou data (dd/mm/aaaa)", ano: true, direito: true }} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!erro && eventos === null && <Carregando />}
      {eventos && (
        <>
          <p className="mb-3 text-sm text-secundario">{eventos.length === 1 ? "1 evento" : `${eventos.length} eventos`}</p>
          {eventos.length === 0 ? (
            <Aviso>Nenhum evento encontrado com esses filtros.</Aviso>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {eventos.map((e) => <CartaoEvento key={e.id} evento={e} />)}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function CartaoEvento({ evento: e }: { evento: Evento }) {
  return (
    <li className="min-w-0">
      <Link to={`/evento/${e.id}`} className="group block overflow-hidden rounded-grande border border-borda bg-superficie hover:border-titulo focus-visible:border-titulo">
        <div className="aspect-[4/3] bg-zebra">
          {e.capa_url ? (
            <img src={e.capa_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-secundario">Sem capa</div>
          )}
        </div>
        <div className="space-y-1 p-4">
          <p className="line-clamp-2 font-bold text-titulo group-hover:underline">{e.nome}</p>
          <p className="truncate text-sm text-secundario">{dataCurta(e.data_evento)}{e.local ? ` · ${e.local}` : ""}</p>
          <p className="truncate text-sm text-secundario">{resumoDoEvento(e)}</p>
          <div className="pt-1"><Status tom={tomDoDireito(e.direito_uso)}>{rotuloDoDireito(e.direito_uso)}</Status></div>
        </div>
      </Link>
    </li>
  );
}
