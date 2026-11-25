import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Aviso, BOTAO, Carregando, Status, cn } from "../componentes/ui";
import {
  dataCurta, dataHoraBrasil, duracaoLegivel, FORMATOS, pode, podeCompartilharExternamente, rotuloDoDireito, rotuloDoTipo,
  tamanhoLegivel, tomDoDireito, type Arquivo as TArquivo,
} from "../lib/dominio";
import { emBreve } from "./EmBreve";

// Ficha de um arquivo: a prévia grande (só aqui; a grade carrega só miniaturas), os dados e as ações.
// "Anterior/Próximo" (e as setas do teclado) andam pela lista de onde a pessoa veio.
export default function Arquivo() {
  const { id = "" } = useParams();
  const { eu, avisar } = useApp();
  const navegar = useNavigate();
  const local = useLocation();
  const lista: string[] = (local.state as { lista?: string[] } | null)?.lista ?? [];
  const [arquivo, setArquivo] = useState<TArquivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setArquivo(null);
    setErro(null);
    api<{ arquivo: TArquivo }>(`arquivos?id=${encodeURIComponent(id)}`)
      .then((r) => { if (vivo) setArquivo(r.arquivo); })
      .catch((e: ErroApi) => { if (vivo && e.status !== 401) setErro(e.status === 404 ? "Arquivo não encontrado, ou você não tem acesso a ele." : e.message); });
    return () => { vivo = false; };
  }, [id]);

  const i = lista.indexOf(id);
  const anterior = i > 0 ? lista[i - 1] : null;
  const proximo = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
  const ir = (outro: string | null) => { if (outro) navegar(`/arquivo/${outro}`, { replace: true, state: { lista } }); };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") ir(anterior);
      if (e.key === "ArrowRight") ir(proximo);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const voltar = arquivo
    ? <Link to={`/evento/${arquivo.evento_id}`} className={BOTAO.texto}>Voltar para {arquivo.evento_nome}</Link>
    : <Link to="/" className={BOTAO.texto}>Voltar para eventos</Link>;

  if (erro) return <><div className="mb-3">{voltar}</div><Aviso tom="erro">{erro}</Aviso></>;
  if (!arquivo) return <Carregando />;
  const a = arquivo;
  const compartilhavel = podeCompartilharExternamente(a.direito_efetivo);
  const excecao = a.direito_arquivo !== a.direito_evento;

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
              <button type="button" className={BOTAO.contorno} onClick={() => avisar(emBreve(3))}>{a.favorito ? "Tirar dos favoritos" : "Favoritar"}</button>
              {pode(eu.perfil, "organizar") && <button type="button" className={BOTAO.contorno} onClick={() => avisar(emBreve(3))}>Editar</button>}
              {pode(eu.perfil, "compartilhar") && (
                <button type="button" className={BOTAO.contorno} disabled={!compartilhavel} onClick={() => avisar(emBreve(4))}
                  title={compartilhavel ? undefined : "Só arquivos com uso liberado podem ir para link externo."}>
                  Link externo
                </button>
              )}
            </div>
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
            <Linha rotulo="Legenda">{a.legenda || "—"}</Linha>
            <Linha rotulo="Tags">
              {a.tags.length ? a.tags.map((t) => <Link key={t} to={`/arquivos?q=${encodeURIComponent(t)}`} className="mr-2 text-titulo underline-offset-2 hover:underline">{t}</Link>) : "—"}
            </Linha>
          </dl>

          {pode(eu.perfil, "excluir") && (
            <button type="button" className={cn(BOTAO.texto, "text-erro-texto")} onClick={() => avisar(emBreve(3))}>Mover para a lixeira</button>
          )}
        </aside>
      </div>
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
