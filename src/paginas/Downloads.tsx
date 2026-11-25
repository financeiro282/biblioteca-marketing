import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { ListaFora } from "../componentes/ZipPedido";
import { Aviso, BOTAO, Carregando, Status, type Tom } from "../componentes/ui";
import { baixarZip, quando, VALIDADE_ZIP_DIAS, type Zip } from "../lib/download";
import { tamanhoLegivel } from "../lib/dominio";

// Meus downloads (Fase 4): os zips que a pessoa pediu. Enquanto algum está sendo preparado, a lista se atualiza
// sozinha a cada 4 s (e o servidor retoma o que tiver parado). Cada zip fica 7 dias.

const SITUACAO: Record<Zip["situacao"], [Tom, string]> = {
  na_fila: ["neutro", "Na fila"],
  gerando: ["alerta", "Preparando"],
  pronto: ["sucesso", "Pronto"],
  expirado: ["neutro", "Vencido"],
  falhou: ["erro", "Não foi possível"],
};

export default function Downloads() {
  const { avisar } = useApp();
  const [zips, setZips] = useState<Zip[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api<{ zips: Zip[] }>("zips")
      .then((r) => { setZips(r.zips); setErro(null); })
      .catch((e: ErroApi) => { if (e.status !== 401) setErro(e.message); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const andando = !!zips?.some((z) => z.situacao === "na_fila" || z.situacao === "gerando");
  useEffect(() => {
    if (!andando) return;
    const t = window.setInterval(carregar, 4000);
    return () => window.clearInterval(t);
  }, [andando, carregar]);

  const baixar = async (z: Zip, n: number) => {
    setBaixando(`${z.id}-${n}`);
    try { await baixarZip(z.id, n); } catch (e) { if ((e as ErroApi).status !== 401) { avisar((e as ErroApi).message); carregar(); } } finally { setBaixando(null); }
  };

  return (
    <>
      <Cabecalho titulo="Meus downloads">
        <p className="mt-2 max-w-3xl text-sm text-secundario">
          Os zips que você pediu. Cada um fica {VALIDADE_ZIP_DIAS} dias. Para pedir, na página do evento use "Baixar todos (zip)" ou "Selecionar".
        </p>
      </Cabecalho>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!erro && zips === null && <Carregando />}
      {zips?.length === 0 && <Aviso>Você ainda não pediu nenhum zip.</Aviso>}
      <ul className="space-y-3">
        {zips?.map((z) => {
          const [tom, rotulo] = SITUACAO[z.situacao];
          const prontas = z.partes.filter((p) => p.situacao === "pronto").length;
          return (
            <li key={z.id} className="rounded-grande border border-borda bg-superficie p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h2 className="min-w-0 break-words text-base font-bold text-titulo">{z.titulo}</h2>
                <Status tom={tom}>{rotulo}</Status>
              </div>
              <p className="mt-1 text-sm text-secundario">
                Pedido em {quando(z.criado_em)} · {z.total_arquivos === 1 ? "1 arquivo" : `${z.total_arquivos} arquivos`} · {tamanhoLegivel(z.total_bytes)}
                {z.partes.length > 1 ? ` · ${z.partes.length} partes` : ""}
              </p>
              {z.situacao === "na_fila" && <p className="mt-2 text-sm text-texto">Começa em instantes. Pode fechar a página: o aviso chega pelo Portal.</p>}
              {z.situacao === "gerando" && (
                <p className="mt-2 text-sm text-texto">
                  {z.partes.length > 1 ? `${prontas} de ${z.partes.length} partes prontas.` : "Montando o zip."} Pode fechar a página: o aviso chega pelo Portal.
                </p>
              )}
              {z.situacao === "pronto" && (
                <>
                  <p className="mt-2 text-sm text-texto">Disponível até {quando(z.expira_em)}.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {z.partes.map((p) => (
                      <button key={p.n} type="button" className={BOTAO.contorno} disabled={baixando === `${z.id}-${p.n}`} onClick={() => baixar(z, p.n)}>
                        {baixando === `${z.id}-${p.n}` ? "Abrindo…" : z.partes.length > 1 ? `Baixar parte ${p.n} (${tamanhoLegivel(p.bytes)})` : `Baixar (${tamanhoLegivel(p.bytes)})`}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {z.situacao === "expirado" && <p className="mt-2 text-sm text-texto">Venceu. Se precisar, peça de novo na página do evento.</p>}
              {z.situacao === "falhou" && (
                <p className="mt-2 text-sm text-texto">Não foi possível preparar este zip{z.erro ? ` (${z.erro})` : ""}. Peça de novo; se repetir, avise o Marketing.</p>
              )}
              {z.fora.length > 0 && z.situacao !== "expirado" && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-titulo underline underline-offset-2">
                    {z.fora.length === 1 ? "1 arquivo grande ficou fora do zip: ver e baixar direto" : `${z.fora.length} arquivos grandes ficaram fora do zip: ver e baixar direto`}
                  </summary>
                  <div className="mt-2"><ListaFora fora={z.fora} /></div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
