import { useSearchParams } from "react-router-dom";
import { Cabecalho } from "../componentes/Layout";
import { Filtros } from "../componentes/Filtros";
import { GradeDeMiniaturas } from "../componentes/Miniaturas";
import { Aviso, BOTAO, Carregando } from "../componentes/ui";
import { useArquivos } from "../lib/useArquivos";

// Busca em toda a biblioteca — e as listas "Favoritos" (de cada pessoa) e "Aprovadas para uso" (marcadas pelo
// Marketing), que são a mesma busca com um filtro fixo.
const TITULO = { busca: "Buscar arquivos", favoritos: "Favoritos", aprovadas: "Aprovadas para uso" } as const;
const VAZIO = {
  busca: "Nenhum arquivo encontrado com esses filtros.",
  favoritos: "Você ainda não marcou nenhum favorito.",
  aprovadas: "Nenhum arquivo aprovado para uso com esses filtros.",
} as const;

export default function Arquivos({ modo }: { modo: keyof typeof TITULO }) {
  const [params] = useSearchParams();
  const lista = useArquivos({
    q: params.get("q"), tipo: params.get("tipo"), ano: params.get("ano"), direito: params.get("direito"),
    favoritos: modo === "favoritos", aprovadas: modo === "aprovadas",
  });

  return (
    <>
      <Cabecalho titulo={TITULO[modo]} />
      <Filtros opcoes={{ busca: "Evento, tag, local, legenda ou data (dd/mm/aaaa)", tipo: true, ano: true, direito: true }} />
      {lista.erro && <Aviso tom="erro">{lista.erro}</Aviso>}
      {!lista.erro && lista.arquivos === null && <Carregando />}
      {lista.arquivos && (
        <>
          <p className="mb-3 text-sm text-secundario">{lista.total === 1 ? "1 arquivo" : `${lista.total} arquivos`}</p>
          {lista.arquivos.length === 0 ? <Aviso>{VAZIO[modo]}</Aviso> : <GradeDeMiniaturas arquivos={lista.arquivos} mostrarEvento />}
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
