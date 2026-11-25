import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { Aviso, BOTAO, Carregando, Janela, cn } from "../componentes/ui";
import { DIAS_LIXEIRA, diasParaApagar, type ArquivoNaLixeira, type EventoNaLixeira } from "../lib/controle";
import { dataCurta, tamanhoLegivel } from "../lib/dominio";
import { quando } from "../lib/download";

// Lixeira (Fase 5): só o Administrador. Restaurar volta o item para onde estava; "Apagar de vez" tira do
// armazenamento e do cadastro (não tem volta). Depois de 30 dias, a rotina diária apaga sozinha.

type Confirmar = { titulo: string; texto: string; acao: () => Promise<string> };

const prazo = (iso: string) => {
  const d = diasParaApagar(iso);
  return d === 0 ? "Apaga de vez na próxima rotina (8h)" : `Apaga de vez em ${d === 1 ? "1 dia" : `${d} dias`}`;
};

export default function Lixeira() {
  const { avisar } = useApp();
  const [dados, setDados] = useState<{ eventos: EventoNaLixeira[]; arquivos: ArquivoNaLixeira[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [entendi, setEntendi] = useState(false);
  const [indo, setIndo] = useState(false);

  const carregar = useCallback(() => {
    api<{ eventos: EventoNaLixeira[]; arquivos: ArquivoNaLixeira[] }>("controle?rota=lixeira")
      .then((r) => { setDados(r); setErro(null); setMarcados(new Set()); })
      .catch((e: ErroApi) => { if (e.status !== 401) setErro(e.message); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (fn: () => Promise<string>) => {
    setIndo(true);
    try { avisar(await fn()); setConfirmar(null); carregar(); }
    catch (e) { if ((e as ErroApi).status !== 401) avisar((e as ErroApi).message); carregar(); }
    finally { setIndo(false); setEntendi(false); }
  };
  const restaurar = (ids: string[]) => executar(async () => {
    const r = await api<{ restaurados: number }>("controle", "POST", { acao: "restaurar", ids });
    return r.restaurados === 1 ? "1 arquivo restaurado." : `${r.restaurados} arquivos restaurados.`;
  });
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const arquivos = dados?.arquivos ?? [];
  const eventos = dados?.eventos ?? [];
  const sel = [...marcados];

  return (
    <>
      <Cabecalho titulo="Lixeira">
        <p className="mt-2 max-w-3xl text-sm text-secundario">
          O que foi mandado para a lixeira fica aqui {DIAS_LIXEIRA} dias. Restaurar volta para onde estava. Depois do prazo, ou
          com "Apagar de vez", o arquivo sai do armazenamento e do cadastro, sem volta. Fica no log quem apagou.
        </p>
      </Cabecalho>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!erro && !dados && <Carregando />}
      {dados && !eventos.length && !arquivos.length && <Aviso>A lixeira está vazia.</Aviso>}

      {eventos.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-bold text-titulo">Eventos ({eventos.length})</h2>
          <ul className="space-y-3">
            {eventos.map((e) => (
              <li key={e.id} className="rounded-grande border border-borda bg-superficie p-4">
                <p className="font-semibold text-titulo">{e.nome} <span className="font-normal text-secundario">({dataCurta(e.data_evento)})</span></p>
                <p className="mt-1 text-sm text-secundario">
                  {e.arquivos === 1 ? "1 arquivo" : `${e.arquivos} arquivos`} · {tamanhoLegivel(e.bytes)} · na lixeira desde {quando(e.excluido_em)}
                  {e.excluido_por_nome ? ` por ${e.excluido_por_nome}` : ""} · {prazo(e.excluido_em)}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className={BOTAO.contorno} disabled={indo}
                    onClick={() => executar(async () => { await api("controle", "POST", { acao: "restaurar_evento", id: e.id }); return "Evento restaurado, com os arquivos dele."; })}>
                    Restaurar evento
                  </button>
                  <button type="button" className={cn(BOTAO.texto, "text-erro-texto")} onClick={() => setConfirmar({
                    titulo: "Apagar este evento de vez?",
                    texto: `"${e.nome}" e ${e.arquivos === 1 ? "o arquivo dele" : `os ${e.arquivos} arquivos dele`} (${tamanhoLegivel(e.bytes)}) saem do armazenamento e do cadastro.`,
                    acao: async () => { const r = await api<{ arquivos: number }>("controle", "POST", { acao: "apagar_evento", id: e.id }); return `Evento apagado de vez (${r.arquivos} arquivos).`; },
                  })}>Apagar de vez</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {arquivos.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-titulo">Arquivos ({arquivos.length})</h2>
            <button type="button" className={BOTAO.texto} onClick={() => setMarcados(sel.length === arquivos.length ? new Set() : new Set(arquivos.slice(0, 500).map((a) => a.id)))}>
              {sel.length === arquivos.length ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>
          <ul className="divide-y divide-borda rounded-grande border border-borda bg-superficie">
            {arquivos.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" checked={marcados.has(a.id)} onChange={() => alternar(a.id)} className="h-4 w-4 shrink-0 accent-[var(--cor-titulo)]" />
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded border border-borda bg-zebra">
                    {a.miniatura_url
                      ? <img src={a.miniatura_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <span className="flex h-full items-center justify-center text-[10px] font-semibold text-secundario">{a.extensao.toUpperCase()}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-titulo">{a.nome_original}</span>
                    <span className="block text-xs text-secundario">
                      {a.evento_nome} · {tamanhoLegivel(a.tamanho_bytes)} · {quando(a.excluido_em)}{a.excluido_por_nome ? ` por ${a.excluido_por_nome}` : ""} · {prazo(a.excluido_em)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {sel.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-superficie px-4 py-3 lg:left-16" role="region" aria-label="Arquivos marcados">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 md:px-4">
                <p className="text-sm font-semibold text-titulo">{sel.length === 1 ? "1 marcado" : `${sel.length} marcados`}</p>
                <button type="button" className={BOTAO.principal} disabled={indo} onClick={() => restaurar(sel)}>Restaurar</button>
                <button type="button" className={BOTAO.contorno} disabled={indo} onClick={() => setConfirmar({
                  titulo: sel.length === 1 ? "Apagar 1 arquivo de vez?" : `Apagar ${sel.length} arquivos de vez?`,
                  texto: `${tamanhoLegivel(arquivos.filter((a) => marcados.has(a.id)).reduce((s, a) => s + a.tamanho_bytes, 0))} saem do armazenamento e do cadastro.`,
                  acao: async () => { const r = await api<{ apagados: number }>("controle", "POST", { acao: "apagar", ids: sel }); return r.apagados === 1 ? "1 arquivo apagado de vez." : `${r.apagados} arquivos apagados de vez.`; },
                })}>Apagar de vez</button>
                <button type="button" className={BOTAO.texto} onClick={() => setMarcados(new Set())}>Cancelar</button>
              </div>
            </div>
          )}
        </section>
      )}

      {confirmar && (
        <Janela aberta titulo={confirmar.titulo} onFechar={() => { setConfirmar(null); setEntendi(false); }}
          rodape={<>
            <button type="button" className={BOTAO.texto} onClick={() => { setConfirmar(null); setEntendi(false); }}>Cancelar</button>
            <button type="button" className={BOTAO.perigo} disabled={!entendi || indo} onClick={() => executar(confirmar.acao)}>{indo ? "Apagando…" : "Apagar de vez"}</button>
          </>}>
          <div className="space-y-3 text-sm text-texto">
            <p>{confirmar.texto}</p>
            <label className="flex cursor-pointer items-start gap-2 font-semibold text-titulo">
              <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--cor-titulo)]" />
              Entendo que não dá para desfazer.
            </label>
          </div>
        </Janela>
      )}
    </>
  );
}
