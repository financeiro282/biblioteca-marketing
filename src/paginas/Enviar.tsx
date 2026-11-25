import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ErroApi } from "../api";
import { Cabecalho } from "../componentes/Layout";
import { Aviso, BOTAO, CAMPO, Campo, Carregando, cn, LISTA, Status, type Tom } from "../componentes/ui";
import { FORMATOS, dataCurta, rotuloDoDireito, tamanhoLegivel, type Evento } from "../lib/dominio";
import { Fila, type Item } from "../envio/fila";

// ENVIAR ARQUIVOS (Fase 2) — Marketing e Administrador. Arrastar e soltar (arquivos ou pastas) ou escolher; a fila
// (src/envio/fila.ts) leva cada um direto ao armazenamento, com progresso, retomada e aviso de duplicado.

const ACEITOS = Object.keys(FORMATOS).map((e) => `.${e}`).join(",");

// Pastas arrastadas: lê o conteúdo (e as subpastas) — a carga do acervo é "uma pasta por evento".
async function arquivosDoArraste(dt: DataTransfer): Promise<File[]> {
  const entradas = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entradas.length) return [...dt.files];
  const saida: File[] = [];
  const ler = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      saida.push(await new Promise<File>((ok, falha) => (e as FileSystemFileEntry).file(ok, falha)));
    } else if (e.isDirectory) {
      const leitor = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const lote = await new Promise<FileSystemEntry[]>((ok, falha) => leitor.readEntries(ok, falha));
        if (!lote.length) break;
        for (const x of lote) await ler(x);
      }
    }
  };
  for (const e of entradas) await ler(e);
  return saida;
}

const DIREITOS_ARQUIVO = [
  { valor: "liberado", rotulo: "Igual ao do evento" },
  { valor: "interno", rotulo: "Somente uso interno" },
  { valor: "sem_autorizacao", rotulo: "Sem autorização" },
];

function textoDoItem(i: Item): string {
  const pct = (n: number) => `${Math.floor((n / Math.max(1, i.arquivo.size)) * 100)}%`;
  switch (i.situacao) {
    case "fila": return "Na fila";
    case "conferindo": return `Conferindo ${pct(i.conferidos)}`;
    case "preparando": return "Preparando";
    case "enviando": return `${i.retomado ? "Continuando" : "Enviando"} ${pct(i.enviados)}${i.esperandoConexao ? " · sem conexão, tentando de novo" : ""}`;
    case "concluindo": return i.esperandoConexao ? "Concluindo · sem conexão, tentando de novo" : "Concluindo";
    case "pronto": return i.mensagem ? `Pronto · ${i.mensagem}` : "Pronto";
    case "duplicado": return i.mensagem || "Já enviado antes";
    case "erro": return i.mensagem || "Falha no envio";
    case "cancelado": return "Cancelado";
  }
}
const tomDoItem = (i: Item): Tom => (i.situacao === "pronto" ? "sucesso" : i.situacao === "duplicado" ? "alerta" : i.situacao === "erro" ? "erro" : "neutro");
const ativo = (i: Item) => ["conferindo", "preparando", "enviando", "concluindo"].includes(i.situacao);

export default function Enviar() {
  const [params, setParams] = useSearchParams();
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erroEventos, setErroEventos] = useState<string | null>(null);
  const [direito, setDireito] = useState("liberado");
  const [autor, setAutor] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [, setVersao] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  // A fila vive enquanto a tela estiver aberta; a tela redesenha no máximo 5 vezes por segundo.
  const pendente = useRef(false);
  const fila = useMemo(() => new Fila(() => {
    if (pendente.current) return;
    pendente.current = true;
    setTimeout(() => { pendente.current = false; setVersao((v) => v + 1); }, 200);
  }), []);

  const eventoId = params.get("evento") ?? "";
  const evento = eventos?.find((e) => e.id === eventoId) ?? null;

  useEffect(() => {
    api<{ eventos: Evento[] }>("eventos")
      .then((r) => setEventos(r.eventos))
      .catch((e: ErroApi) => { if (e.status !== 401) setErroEventos(e.message); });
  }, []);

  // Fechar a aba no meio do envio interrompe: o navegador pergunta antes.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => { if (fila.ocupada) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [fila]);

  const adicionar = (arquivos: File[]) => {
    if (!evento || !arquivos.length) return;
    fila.adicionar(arquivos, { eventoId: evento.id, direito, autor: autor.trim() });
  };
  const soltar = async (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (!evento) return;
    adicionar(await arquivosDoArraste(e.dataTransfer));
  };

  const itens = fila.itens;
  const validos = itens.filter((i) => i.situacao !== "erro" || i.id);
  const prontos = itens.filter((i) => i.situacao === "pronto").length;
  const duplicados = itens.filter((i) => i.situacao === "duplicado").length;
  const erros = itens.filter((i) => i.situacao === "erro").length;
  const totalBytes = validos.reduce((s, i) => s + (i.situacao === "duplicado" ? 0 : i.arquivo.size), 0);
  const enviados = validos.reduce((s, i) => s + (i.situacao === "pronto" ? i.arquivo.size : i.situacao === "duplicado" ? 0 : i.enviados), 0);
  const naoTocam = itens.filter((i) => i.toca === false).length;
  const terminou = itens.length > 0 && !fila.ocupada;

  if (erroEventos) return <><Cabecalho titulo="Enviar arquivos" /><Aviso tom="erro">{erroEventos}</Aviso></>;
  if (!eventos) return <Carregando />;

  return (
    <>
      <Cabecalho titulo="Enviar arquivos" />
      {eventos.length === 0 ? (
        <Aviso>Nenhum evento cadastrado. <Link to="/evento/novo" className="font-semibold text-titulo underline">Crie o evento</Link> antes de enviar os arquivos.</Aviso>
      ) : (
        <div className="space-y-6">
          <div className="grid max-w-4xl gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Campo id="env-evento" rotulo="Evento" ajuda={evento ? `${dataCurta(evento.data_evento)} · ${rotuloDoDireito(evento.direito_uso)}` : "Os arquivos entram neste evento."}>
              <select id="env-evento" className={cn(LISTA, "sm:w-full")} value={eventoId} disabled={fila.ocupada}
                onChange={(e) => setParams(e.target.value ? { evento: e.target.value } : {}, { replace: true })}>
                <option value="">Escolha o evento</option>
                {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome} ({dataCurta(e.data_evento)})</option>)}
              </select>
            </Campo>
            <Campo id="env-direito" rotulo="Direito de uso destes arquivos" ajuda="Vale o mais restrito entre o evento e o arquivo.">
              <select id="env-direito" className={cn(LISTA, "sm:w-full")} value={direito} onChange={(e) => setDireito(e.target.value)}>
                {DIREITOS_ARQUIVO.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
              </select>
            </Campo>
            <Campo id="env-autor" rotulo="Autor (fotógrafo ou videomaker)" ajuda="Opcional. Vale para os arquivos que entrarem a partir de agora." className="md:col-span-2">
              <input id="env-autor" className={cn(CAMPO, "max-w-xl")} value={autor} maxLength={200} onChange={(e) => setAutor(e.target.value)} />
            </Campo>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); if (evento) setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
            className={cn("rounded-grande border-2 border-dashed px-4 py-10 text-center",
              !evento ? "border-borda bg-zebra" : arrastando ? "border-titulo bg-zebra" : "border-borda-campo bg-superficie")}
          >
            {evento ? (
              <>
                <p className="font-semibold text-titulo">Arraste aqui as fotos e os vídeos (ou uma pasta)</p>
                <p className="mt-1 text-sm text-secundario">JPG, PNG, HEIC, MP4, MOV e RAW. O original é guardado como veio.</p>
                <button type="button" className={cn(BOTAO.principal, "mt-4")} onClick={() => entrada.current?.click()}>Escolher arquivos</button>
                <input ref={entrada} type="file" multiple accept={ACEITOS} className="hidden"
                  onChange={(e) => { adicionar([...(e.target.files ?? [])]); e.target.value = ""; }} />
              </>
            ) : (
              <p className="text-sm text-secundario">Escolha o evento acima para enviar os arquivos.</p>
            )}
          </div>

          <Aviso>
            Mantenha esta aba aberta até o fim: fechar interrompe o envio. Se a internet cair, o envio continua sozinho quando
            ela voltar. Se a aba fechar, arraste os mesmos arquivos de novo: eles continuam de onde pararam.
          </Aviso>

          {itens.length > 0 && (
            <section aria-label="Arquivos na fila" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-sm text-titulo">
                  <span className="font-semibold">{prontos} de {validos.length - duplicados} enviados</span>
                  {" · "}{tamanhoLegivel(enviados)} de {tamanhoLegivel(totalBytes)}
                  {duplicados > 0 && ` · ${duplicados} já existiam`}
                  {erros > 0 && ` · ${erros} com erro`}
                  {naoTocam > 0 && ` · ${naoTocam} ${naoTocam === 1 ? "vídeo não abre" : "vídeos não abrem"} no navegador`}
                </p>
                {terminou && <button type="button" className={BOTAO.texto} onClick={() => fila.limparConcluidos()}>Limpar os concluídos</button>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-borda" role="progressbar" aria-label="Progresso do envio"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor((enviados / Math.max(1, totalBytes)) * 100)}>
                <div className="h-full bg-titulo" style={{ width: `${Math.min(100, (enviados / Math.max(1, totalBytes)) * 100)}%` }} />
              </div>
              {terminou && evento && (
                <Aviso>Envio terminado. <Link to={`/evento/${evento.id}`} className="font-semibold text-titulo underline">Ver o evento</Link></Aviso>
              )}
              <ul className="divide-y divide-borda rounded-grande border border-borda bg-superficie">
                {itens.map((i) => (
                  <li key={i.chave} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-titulo" title={i.arquivo.name}>{i.arquivo.name}</p>
                      <div className="flex min-w-0 items-center gap-3">
                        <Status tom={tomDoItem(i)}><span className="break-words">{textoDoItem(i)}</span></Status>
                      </div>
                      {ativo(i) && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-borda">
                          <div className="h-full bg-titulo" style={{ width: `${Math.min(100, ((i.situacao === "conferindo" ? i.conferidos : i.enviados) / Math.max(1, i.arquivo.size)) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-sm tabular-nums text-secundario">{tamanhoLegivel(i.arquivo.size)}</span>
                      {(i.situacao === "fila" || ativo(i)) && i.cancelar && <button type="button" className={BOTAO.texto} onClick={() => i.cancelar?.()}>Cancelar</button>}
                      {(i.situacao === "erro" || i.situacao === "cancelado") && formatoValido(i) && (
                        <button type="button" className={BOTAO.texto} onClick={() => fila.tentarDeNovo(i)}>Tentar de novo</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

const formatoValido = (i: Item) => i.mensagem !== "Formato não aceito." && i.mensagem !== "Arquivo vazio.";
