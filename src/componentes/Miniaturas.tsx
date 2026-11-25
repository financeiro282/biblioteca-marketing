import { Link } from "react-router-dom";
import { duracaoLegivel, rotuloDoDireito, type Arquivo, type Direito } from "../lib/dominio";
import { Etiqueta, cn } from "./ui";

// Grade de miniaturas: só a miniatura (320 px) é carregada, e só quando chega perto da tela (loading="lazy").
// A foto grande só abre na ficha do arquivo. Sem prévia (RAW sem prévia embutida): um quadro neutro com o formato.
// MODO SELEÇÃO (Fase 3, Marketing): com `selecao`, o clique marca/desmarca em vez de abrir a ficha.

const NIVEL: Record<Direito, number> = { liberado: 1, interno: 2, sem_autorizacao: 3 };

export type Selecao = { ids: Set<string>; alternar: (id: string) => void };

export function Miniatura({ arquivo, mostrarEvento, lista, selecao, className }: {
  arquivo: Arquivo; mostrarEvento?: boolean; lista?: string[]; selecao?: Selecao; className?: string;
}) {
  const a = arquivo;
  // Etiqueta de direito só quando o ARQUIVO é mais restrito que o evento (a exceção) — o direito do evento já está
  // no alto da página. Na busca geral (mostrarEvento), sempre que não for "Uso liberado".
  const restrito = mostrarEvento ? a.direito_efetivo !== "liberado" : NIVEL[a.direito_efetivo] > NIVEL[a.direito_evento];
  const marcado = !!selecao?.ids.has(a.id);
  const quadro = (
    <div className={cn("relative aspect-square overflow-hidden rounded border bg-zebra",
      marcado ? "border-titulo ring-2 ring-titulo" : "border-borda group-hover:border-titulo group-focus-visible:border-titulo")}>
      {a.miniatura_url ? (
        <img src={a.miniatura_url} alt={a.legenda || a.nome_original} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
          <span className="text-xs font-semibold text-secundario">{a.extensao.toUpperCase()}</span>
          <span className="mt-1 text-xs text-secundario">Sem prévia</span>
        </div>
      )}
      <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
        {selecao && (marcado
          ? <Etiqueta>Selecionado</Etiqueta>
          : <span className="pointer-events-none rounded border border-borda-campo bg-superficie px-1.5 py-0.5 text-xs font-semibold text-titulo">Selecionar</span>)}
        {a.aprovada && <Etiqueta>Aprovada</Etiqueta>}
        {restrito && <Etiqueta>{rotuloDoDireito(a.direito_efetivo)}</Etiqueta>}
      </div>
      <div className="absolute bottom-1.5 right-1.5 flex gap-1">
        {a.tipo === "video" && <Etiqueta>Vídeo{a.duracao_seg ? ` ${duracaoLegivel(a.duracao_seg)}` : ""}</Etiqueta>}
        {a.tipo === "raw" && <Etiqueta>RAW</Etiqueta>}
      </div>
    </div>
  );
  const titulo = [a.nome_original, a.legenda].filter(Boolean).join(" — ");
  return (
    <li className={cn("min-w-0", className)}>
      {selecao ? (
        <button type="button" onClick={() => selecao.alternar(a.id)} aria-pressed={marcado} title={titulo}
          className="group block w-full text-left focus-visible:outline-none">
          {quadro}
          {mostrarEvento && <p className="mt-1 truncate text-xs text-secundario">{a.evento_nome}</p>}
        </button>
      ) : (
        <Link to={`/arquivo/${a.id}`} state={lista ? { lista } : undefined} className="group block focus-visible:outline-none" title={titulo}>
          {quadro}
          {mostrarEvento && <p className="mt-1 truncate text-xs text-secundario">{a.evento_nome}</p>}
        </Link>
      )}
    </li>
  );
}

export function GradeDeMiniaturas({ arquivos, mostrarEvento, selecao }: { arquivos: Arquivo[]; mostrarEvento?: boolean; selecao?: Selecao }) {
  const lista = arquivos.map((a) => a.id); // para "Anterior/Próximo" na ficha
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" aria-label="Arquivos">
      {arquivos.map((a) => <Miniatura key={a.id} arquivo={a} mostrarEvento={mostrarEvento} lista={lista} selecao={selecao} />)}
    </ul>
  );
}
