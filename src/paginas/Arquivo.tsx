import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { ConfirmarLixeira, resumoDoLote } from "../componentes/EdicaoEmLote";
import { AREA, Aviso, BOTAO, CAMPO, Campo, Carregando, Janela, LISTA, Status, cn } from "../componentes/ui";
import {
  dataCurta, dataHoraBrasil, duracaoLegivel, FORMATOS, LIMITES_ARQUIVO, lerArquivoEditado, pode, podeAprovar,
  podeCompartilharExternamente, rotuloDoDireito, rotuloDoTipo, tamanhoLegivel, tomDoDireito, type Arquivo as TArquivo,
} from "../lib/dominio";
import { emBreve } from "./EmBreve";

// Ficha de um arquivo: a prévia grande (só aqui; a grade carrega só miniaturas), os dados e as ações.
// "Anterior/Próximo" (e as setas do teclado) andam pela lista de onde a pessoa veio.
// Fase 3 (25/11/2026): favoritar (todos), editar, aprovar, capa do evento e lixeira (Marketing/Admin).
export default function Arquivo() {
  const { id = "" } = useParams();
  const { eu, avisar } = useApp();
  const navegar = useNavigate();
  const local = useLocation();
  const lista: string[] = (local.state as { lista?: string[] } | null)?.lista ?? [];
  const [arquivo, setArquivo] = useState<TArquivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<"editar" | "lixeira" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api<{ arquivo: TArquivo }>(`arquivos?id=${encodeURIComponent(id)}`)
      .then((r) => { if (vivo) setArquivo(r.arquivo); })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErro(e.status === 404 ? "Arquivo não encontrado, ou você não tem acesso a ele." : e.message); });
    return () => { vivo = false; };
  }, [id, recarga]);

  const i = lista.indexOf(id);
  const anterior = i > 0 ? lista[i - 1] : null;
  const proximo = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
  const ir = (outro: string | null) => { if (outro) navegar(`/arquivo/${outro}`, { replace: true, state: { lista } }); };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (janela || (e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") ir(anterior);
      if (e.key === "ArrowRight") ir(proximo);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  // Ação rápida (favoritar, aprovar, capa): mostra o resultado e lê o arquivo de novo.
  const acao = async (corpo: Record<string, unknown>, ok: (r: never) => string) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await api<never>("arquivos", "POST", corpo);
      avisar(ok(r));
      setRecarga((n) => n + 1);
    } catch (e) {
      if ((e as ErroApi).status !== 401) avisar((e as ErroApi).message);
    } finally {
      setOcupado(false);
    }
  };

  const voltar = arquivo
    ? <Link to={`/evento/${arquivo.evento_id}`} className={BOTAO.texto}>Voltar para {arquivo.evento_nome}</Link>
    : <Link to="/" className={BOTAO.texto}>Voltar para eventos</Link>;

  if (erro) return <><div className="mb-3">{voltar}</div><Aviso tom="erro">{erro}</Aviso></>;
  if (!arquivo || arquivo.id !== id.toLowerCase()) return <Carregando />;
  const a = arquivo;
  const compartilhavel = podeCompartilharExternamente(a.direito_efetivo);
  const excecao = a.direito_arquivo !== a.direito_evento;
  const organiza = pode(eu.perfil, "organizar");
  const aprovavel = podeAprovar(a.direito_efetivo);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {voltar}
        {lista.length > 1 && i >= 0 && (
          <div className="flex items-center gap-4">
            <button type="button" className={BOTAO.texto} disabled={!anterior} onClick={() => ir(anterior)}>Anterior</button>
            <span className="text-sm text-secundario pi-num">{i + 1} de {lista.length}</span>
            <button type="button" className={BOTAO.texto} disabled={!proximo} onClick={() => ir(proximo)}>Próximo</button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-grande border border-borda bg-zebra lg:min-h-[480px]">
          {a.previa_url && a.tipo === "video" ? (
            <video src={a.previa_url} controls preload="metadata" className="max-h-[75vh] w-full" />
          ) : a.previa_url || a.miniatura_url ? (
            <img src={a.previa_url || a.miniatura_url || ""} alt={a.legenda || a.nome_original} className="max-h-[75vh] w-full object-contain" />
          ) : (
            <p className="p-6 text-center text-sm text-secundario">
              {a.tipo === "raw" ? "Arquivo RAW: guardado sem prévia." : "Prévia indisponível."}
            </p>
          )}
        </div>

        <aside className="space-y-5">
          <div>
            <h1 className="break-words text-xl font-bold text-titulo">{a.nome_original}</h1>
            <p className="mt-1 text-sm text-secundario">{rotuloDoTipo(a.tipo)} · {FORMATOS[a.extensao as keyof typeof FORMATOS]?.rotulo ?? a.extensao.toUpperCase()} · {tamanhoLegivel(a.tamanho_bytes)}</p>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" className={BOTAO.principal} onClick={() => avisar(emBreve(4))}>Baixar original</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BOTAO.contorno} disabled={ocupado} aria-pressed={a.favorito}
                onClick={() => acao({ acao: "favoritar", id: a.id, favorito: !a.favorito }, () => (a.favorito ? "Tirado dos favoritos." : "Nos seus favoritos."))}>
                {a.favorito ? "Tirar dos favoritos" : "Favoritar"}
              </button>
              {organiza && <button type="button" className={BOTAO.contorno} onClick={() => setJanela("editar")}>Editar</button>}
              {organiza && (
                <button type="button" className={BOTAO.contorno} disabled={ocupado || (!a.aprovada && !aprovavel)}
                  title={!a.aprovada && !aprovavel ? 'Arquivo "Sem autorização" não é aprovado.' : undefined}
                  onClick={() => acao({ acao: "lote", ids: [a.id], mudar: { aprovada: !a.aprovada } },
                    (r: never) => ((r as { alterados: number }).alterados ? (a.aprovada ? "Aprovação tirada." : "Aprovado para uso.") : resumoDoLote(r)))}>
                  {a.aprovada ? "Tirar aprovação" : "Aprovar para uso"}
                </button>
              )}
              {pode(eu.perfil, "compartilhar") && (
                <button type="button" className={BOTAO.contorno} disabled={!compartilhavel} onClick={() => avisar(emBreve(4))}
                  title={compartilhavel ? undefined : "Só arquivos com uso liberado podem ir para link externo."}>
                  Link externo
                </button>
              )}
            </div>
            {organiza && a.miniatura_url && (
              <button type="button" className={cn(BOTAO.texto, "self-start")} disabled={ocupado}
                onClick={() => acao({ acao: "capa", evento_id: a.evento_id, arquivo_id: a.id }, () => "Agora é a capa do evento.")}>
                Usar como capa do evento
              </button>
            )}
            {organiza && !a.aprovada && !aprovavel && <p className="text-xs text-secundario">Aprovar: só arquivos com uso liberado ou interno.</p>}
            {pode(eu.perfil, "compartilhar") && !compartilhavel && (
              <p className="text-xs text-secundario">Link externo só para arquivos com uso liberado.</p>
            )}
          </div>

          <dl className="divide-y divide-borda rounded-grande border border-borda bg-superficie text-sm">
            <Linha rotulo="Direito de uso">
              <Status tom={tomDoDireito(a.direito_efetivo)}>{rotuloDoDireito(a.direito_efetivo)}</Status>
              {excecao && (
                <p className="mt-1 text-xs text-secundario">
                  Arquivo: {rotuloDoDireito(a.direito_arquivo)}. Evento: {rotuloDoDireito(a.direito_evento)}. Vale o mais restritivo.
                </p>
              )}
            </Linha>
            <Linha rotulo="Aprovada para uso">{a.aprovada ? "Sim" : "Não"}</Linha>
            <Linha rotulo="Evento"><Link to={`/evento/${a.evento_id}`} className="text-titulo underline-offset-2 hover:underline">{a.evento_nome}</Link> <span className="text-secundario">({dataCurta(a.evento_data)})</span></Linha>
            <Linha rotulo="Data de captura">{dataHoraBrasil(a.capturado_em)}</Linha>
            {(a.largura && a.altura) ? <Linha rotulo="Dimensões"><span className="pi-num">{a.largura} × {a.altura} px</span></Linha> : null}
            {a.duracao_seg ? <Linha rotulo="Duração"><span className="pi-num">{duracaoLegivel(a.duracao_seg)}</span></Linha> : null}
            <Linha rotulo="Autor">{a.autor || "—"}</Linha>
            {a.camera && <Linha rotulo="Câmera">{a.camera}</Linha>}
            <Linha rotulo="Legenda"><span className="whitespace-pre-line">{a.legenda || "—"}</span></Linha>
            <Linha rotulo="Tags">
              {a.tags.length ? a.tags.map((t) => <Link key={t} to={`/arquivos?q=${encodeURIComponent(t)}`} className="mr-2 text-titulo underline-offset-2 hover:underline">{t}</Link>) : "—"}
            </Linha>
          </dl>

          {pode(eu.perfil, "excluir") && (
            <button type="button" className={cn(BOTAO.texto, "text-erro-texto")} onClick={() => setJanela("lixeira")}>Mandar para a lixeira</button>
          )}
        </aside>
      </div>

      {janela === "editar" && (
        <EditarArquivo arquivo={a} onFechar={() => setJanela(null)}
          onSalvo={() => { setJanela(null); avisar("Arquivo salvo."); setRecarga((n) => n + 1); }} />
      )}
      {janela === "lixeira" && (
        <ConfirmarLixeira
          titulo="Mandar este arquivo para a lixeira?"
          texto={<p>{a.nome_original} sai do evento e da busca na hora.</p>}
          onFechar={() => setJanela(null)}
          onConfirmar={async () => {
            await api("arquivos", "POST", { acao: "lixeira", ids: [a.id] });
            avisar("Arquivo na lixeira.");
            navegar(`/evento/${a.evento_id}`, { replace: true });
          }}
        />
      )}
    </>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2.5">
      <dt className="text-secundario">{rotulo}</dt>
      <dd className="min-w-0 break-words text-titulo">{children}</dd>
    </div>
  );
}

// Editar UM arquivo: legenda, autor, tags e direito. Usa a versão (se outra pessoa salvou no meio, nada é gravado).
function EditarArquivo({ arquivo: a, onFechar, onSalvo }: { arquivo: TArquivo; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ legenda: a.legenda ?? "", autor: a.autor ?? "", tags: a.tags.join(", "), direito_uso: a.direito_arquivo as string });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    if (salvando) return;
    const r = lerArquivoEditado(f);
    if (r.erros) { setErros(r.erros); return; }
    setSalvando(true);
    setErros({});
    setErro(null);
    try {
      await api("arquivos", "POST", { acao: "alterar", id: a.id, versao: a.versao, arquivo: r.valores });
      onSalvo();
    } catch (x) {
      const z = x as ErroApi;
      if (z.status === 401) return;
      if (z.erros) setErros(z.erros);
      setErro(z.message);
      setSalvando(false);
    }
  }
  const erroDe = (c: string) => (erros[c] ? <span className="text-erro-texto">{erros[c]}</span> : undefined);
  const ficaSemAutorizacao = f.direito_uso === "sem_autorizacao" && a.aprovada;

  return (
    <Janela aberta titulo="Editar arquivo" onFechar={onFechar}
      rodape={<>
        <button type="button" className={BOTAO.texto} onClick={onFechar}>Cancelar</button>
        <button type="button" className={BOTAO.principal} disabled={salvando} onClick={() => salvar()}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <form onSubmit={salvar} className="space-y-4">
        <p className="truncate text-sm text-secundario" title={a.nome_original}>{a.nome_original}</p>
        <Campo id="arq-legenda" rotulo="Legenda" ajuda={erroDe("legenda") ?? "Opcional. Aparece na busca."}>
          <textarea id="arq-legenda" className={AREA} rows={3} maxLength={LIMITES_ARQUIVO.legenda} value={f.legenda} onChange={(e) => mudar("legenda", e.target.value)} />
        </Campo>
        <Campo id="arq-autor" rotulo="Autor (fotógrafo ou videomaker)" ajuda={erroDe("autor")}>
          <input id="arq-autor" className={CAMPO} maxLength={LIMITES_ARQUIVO.autor} value={f.autor} onChange={(e) => mudar("autor", e.target.value)} />
        </Campo>
        <Campo id="arq-tags" rotulo="Tags" ajuda={erroDe("tags") ?? "Separe por vírgula."}>
          <input id="arq-tags" className={CAMPO} value={f.tags} onChange={(e) => mudar("tags", e.target.value)} />
        </Campo>
        <Campo id="arq-direito" rotulo="Direito de uso deste arquivo" ajuda={`Evento: ${rotuloDoDireito(a.direito_evento)}. Vale o mais restrito dos dois.`}>
          <select id="arq-direito" className={cn(LISTA, "sm:w-full")} value={f.direito_uso} onChange={(e) => mudar("direito_uso", e.target.value)}>
            <option value="liberado">Igual ao do evento</option>
            <option value="interno">Somente uso interno</option>
            <option value="sem_autorizacao">Sem autorização</option>
          </select>
        </Campo>
        {ficaSemAutorizacao && <Aviso tom="alerta">Ao salvar, a aprovação para uso é tirada: arquivo "Sem autorização" não fica aprovado.</Aviso>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}
