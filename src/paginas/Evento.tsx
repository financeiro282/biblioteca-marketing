import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { CriarLink } from "../componentes/CriarLink";
import { ConfirmarLixeira, EdicaoEmLote } from "../componentes/EdicaoEmLote";
import { ZipPedido } from "../componentes/ZipPedido";
import { Filtros } from "../componentes/Filtros";
import { GradeDeMiniaturas } from "../componentes/Miniaturas";
import { Aviso, BOTAO, Carregando, Status } from "../componentes/ui";
import { dataCurta, LOTE_MAXIMO, pode, resumoDoEvento, rotuloDoDireito, tamanhoLegivel, tomDoDireito, type Evento as TEvento } from "../lib/dominio";
import { pedirZip, type PedidoDeZip } from "../lib/download";
import { useArquivos } from "../lib/useArquivos";

// Um evento: os dados dele e a grade de miniaturas (com filtros por tipo, direito e texto).
// "Selecionar" liga o modo seleção. Todos: baixar os escolhidos em zip (Fase 4). Marketing/Admin: editar vários de uma
// vez e mandar para a lixeira (Fase 3) e criar link externo (Fase 4).
export default function Evento() {
  const { id = "" } = useParams();
  const { eu, avisar } = useApp();
  const [params] = useSearchParams();
  const [evento, setEvento] = useState<TEvento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionando, setSelecionando] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [janela, setJanela] = useState<"lote" | "lixeira" | "link" | null>(null);
  const [pedido, setPedido] = useState<PedidoDeZip | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api<{ evento: TEvento }>(`eventos?id=${encodeURIComponent(id)}`)
      .then((r) => { if (vivo) setEvento(r.evento); })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErro(e.status === 404 ? "Evento não encontrado, ou você não tem acesso a ele." : e.message); });
    return () => { vivo = false; };
  }, [id, recarga]);

  const lista = useArquivos({ evento: id, q: params.get("q"), tipo: params.get("tipo"), direito: params.get("direito") });
  const selecao = useMemo(() => (selecionando ? {
    ids,
    alternar: (x: string) => setIds((s) => {
      const n = new Set(s);
      if (n.has(x)) n.delete(x); else if (n.size < LOTE_MAXIMO) n.add(x);
      return n;
    }),
  } : undefined), [selecionando, ids]);
  const sair = () => { setSelecionando(false); setIds(new Set()); setJanela(null); };
  const feito = (msg: string) => { sair(); avisar(msg); lista.recarregar(); setRecarga((n) => n + 1); };
  const podeOrganizar = pode(eu.perfil, "organizar");
  const podeExcluir = pode(eu.perfil, "excluir");
  const podeCompartilhar = pode(eu.perfil, "compartilhar");
  // Zip do evento inteiro ou da seleção: o servidor prepara em segundo plano e avisa pelo Portal.
  const zip = async (corpo: { evento_id: string } | { ids: string[] }) => {
    if (pedindo) return;
    setPedindo(true);
    try {
      setPedido(await pedirZip(corpo));
      if ("ids" in corpo) sair();
    } catch (e) {
      if ((e as ErroApi).status !== 401) avisar((e as ErroApi).message);
    } finally {
      setPedindo(false);
    }
  };
  const voltar = <Link to="/" className={`${BOTAO.texto} mb-3`}>Voltar para eventos</Link>;

  if (erro) return <>{voltar}<Aviso tom="erro">{erro}</Aviso></>;
  if (!evento || evento.id !== id.toLowerCase()) return <Carregando />;

  return (
    <>
      <Cabecalho
        antes={voltar}
        titulo={evento.nome}
        acoes={
          <>
            {pode(eu.perfil, "enviar") && <Link to={`/enviar?evento=${evento.id}`} className={BOTAO.principal}>Enviar arquivos</Link>}
            {podeOrganizar && <Link to={`/evento/${evento.id}/editar`} className={BOTAO.contorno}>Editar evento</Link>}
            {evento.total_arquivos > 0 && (
              <button type="button" className={BOTAO.contorno} disabled={pedindo} onClick={() => zip({ evento_id: evento.id })}>
                {pedindo ? "Pedindo…" : "Baixar todos (zip)"}
              </button>
            )}
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
          {evento.descricao && <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-texto">{evento.descricao}</p>}
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-secundario">{lista.total === 1 ? "1 arquivo" : `${lista.total} arquivos`}</p>
            {lista.arquivos.length > 0 && !selecionando && (
              <button type="button" className={BOTAO.texto} onClick={() => setSelecionando(true)}>Selecionar</button>
            )}
          </div>
          {lista.arquivos.length === 0 ? <Aviso>Nenhum arquivo encontrado.</Aviso> : <GradeDeMiniaturas arquivos={lista.arquivos} selecao={selecao} />}
          {lista.temMais && (
            <div className="mt-6 text-center">
              <button type="button" className={BOTAO.contorno} disabled={lista.carregando} onClick={lista.carregarMais}>
                {lista.carregando ? "Carregando…" : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Barra do modo seleção: fixa embaixo, acima do conteúdo. */}
      {selecionando && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-superficie px-4 py-3 lg:left-16" role="region" aria-label="Arquivos selecionados">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 md:px-4">
            <p className="text-sm font-semibold text-titulo">{ids.size === 1 ? "1 selecionado" : `${ids.size} selecionados`}</p>
            <button type="button" className={podeOrganizar ? BOTAO.contorno : BOTAO.principal} disabled={!ids.size || pedindo} onClick={() => zip({ ids: [...ids] })}>
              {pedindo ? "Pedindo…" : "Baixar (zip)"}
            </button>
            {podeOrganizar && <button type="button" className={BOTAO.principal} disabled={!ids.size} onClick={() => setJanela("lote")}>Editar</button>}
            {podeCompartilhar && <button type="button" className={BOTAO.contorno} disabled={!ids.size} onClick={() => setJanela("link")}>Link externo</button>}
            {podeExcluir && <button type="button" className={BOTAO.contorno} disabled={!ids.size} onClick={() => setJanela("lixeira")}>Mandar para a lixeira</button>}
            <button type="button" className={BOTAO.texto} onClick={() => setIds(new Set((lista.arquivos ?? []).slice(0, LOTE_MAXIMO).map((a) => a.id)))}>
              Selecionar os {Math.min(lista.arquivos?.length ?? 0, LOTE_MAXIMO)} da tela
            </button>
            <button type="button" className={BOTAO.texto} onClick={sair}>Cancelar</button>
          </div>
        </div>
      )}
      {janela === "lote" && <EdicaoEmLote ids={[...ids]} onFechar={() => setJanela(null)} onFeito={feito} />}
      {janela === "link" && <CriarLink ids={[...ids]} tituloInicial={evento.nome} onFechar={sair} />}
      {pedido && <ZipPedido resultado={pedido} onFechar={() => setPedido(null)} />}
      {janela === "lixeira" && (
        <ConfirmarLixeira
          titulo={ids.size === 1 ? "Mandar 1 arquivo para a lixeira?" : `Mandar ${ids.size} arquivos para a lixeira?`}
          texto={<p>Eles somem das listas e da busca na hora.</p>}
          onFechar={() => setJanela(null)}
          onConfirmar={async () => {
            const r = await api<{ na_lixeira: number }>("arquivos", "POST", { acao: "lixeira", ids: [...ids] });
            feito(r.na_lixeira === 1 ? "1 arquivo na lixeira." : `${r.na_lixeira} arquivos na lixeira.`);
          }}
        />
      )}
    </>
  );
}
