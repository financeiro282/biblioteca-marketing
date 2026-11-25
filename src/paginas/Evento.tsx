import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { Filtros } from "../componentes/Filtros";
import { GradeDeMiniaturas } from "../componentes/Miniaturas";
import { Aviso, BOTAO, Carregando, Status } from "../componentes/ui";
import { dataCurta, pode, resumoDoEvento, rotuloDoDireito, tamanhoLegivel, tomDoDireito, type Evento as TEvento } from "../lib/dominio";
import { useArquivos } from "../lib/useArquivos";
import { emBreve } from "./EmBreve";

// Um evento: os dados dele e a grade de miniaturas (com filtros por tipo, direito e texto).
export default function Evento() {
  const { id = "" } = useParams();
  const { eu, avisar } = useApp();
  const [params] = useSearchParams();
  const [evento, setEvento] = useState<TEvento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setEvento(null);
    setErro(null);
    api<{ evento: TEvento }>(`eventos?id=${encodeURIComponent(id)}`)
      .then((r) => { if (vivo) setEvento(r.evento); })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErro(e.status === 404 ? "Evento não encontrado, ou você não tem acesso a ele." : e.message); });
    return () => { vivo = false; };
  }, [id]);

  const lista = useArquivos({ evento: id, q: params.get("q"), tipo: params.get("tipo"), direito: params.get("direito") });
  const voltar = <Link to="/" className={`${BOTAO.texto} mb-3`}>Voltar para eventos</Link>;

  if (erro) return <>{voltar}<Aviso tom="erro">{erro}</Aviso></>;
  if (!evento) return <Carregando />;

  return (
    <>
      <Cabecalho
        antes={voltar}
        titulo={evento.nome}
        acoes={
          <>
            {pode(eu.perfil, "enviar") && <Link to={`/enviar?evento=${evento.id}`} className={BOTAO.principal}>Enviar arquivos</Link>}
            {pode(eu.perfil, "organizar") && <button type="button" className={BOTAO.contorno} onClick={() => avisar(emBreve(3))}>Editar evento</button>}
            <button type="button" className={BOTAO.contorno} onClick={() => avisar(emBreve(4))}>Baixar todos (zip)</button>
          </>
        }
      >
        <div className="mt-3 space-y-2">
          <p className="text-sm text-texto">
            {dataCurta(evento.data_evento)}{evento.local ? ` · ${evento.local}` : ""}{evento.responsavel ? ` · Responsável: ${evento.responsavel}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Status tom={tomDoDireito(evento.direito_uso)}>{rotuloDoDireito(evento.direito_uso)}</Status>
            <span className="text-sm text-secundario">{resumoDoEvento(evento)} · {tamanhoLegivel(evento.total_bytes)}</span>
          </div>
          {evento.descricao && <p className="max-w-3xl text-sm leading-relaxed text-texto">{evento.descricao}</p>}
          {evento.tags.length > 0 && (
            <p className="text-sm text-secundario">Tags: {evento.tags.map((t) => <Link key={t} to={`/arquivos?q=${encodeURIComponent(t)}`} className="mr-2 text-titulo underline-offset-2 hover:underline">{t}</Link>)}</p>
          )}
        </div>
      </Cabecalho>

      <Filtros opcoes={{ busca: "Legenda, autor, tag ou nome do arquivo", tipo: true, direito: true }} />
      {lista.erro && <Aviso tom="erro">{lista.erro}</Aviso>}
      {!lista.erro && lista.arquivos === null && <Carregando />}
      {lista.arquivos && (
        <>
          <p className="mb-3 text-sm text-secundario">{lista.total === 1 ? "1 arquivo" : `${lista.total} arquivos`}</p>
          {lista.arquivos.length === 0 ? <Aviso>Nenhum arquivo encontrado.</Aviso> : <GradeDeMiniaturas arquivos={lista.arquivos} />}
          {lista.temMais && (
            <div className="mt-6 text-center">
              <button type="button" className={BOTAO.contorno} disabled={lista.carregando} onClick={lista.carregarMais}>
                {lista.carregando ? "Carregando…" : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
