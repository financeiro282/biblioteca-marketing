import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { Aviso, BOTAO, Carregando, Janela, Status, type Tom } from "../componentes/ui";
import { quando, type LinkExterno } from "../lib/download";

// Links externos (Fase 4): Marketing e Administrador. Lista, quem criou, se foi usado e "Revogar".
// Criar: na página do evento ("Selecionar" → "Link externo") ou na ficha do arquivo. O endereço só aparece na criação.

const SITUACAO: Record<LinkExterno["situacao"], [Tom, string]> = {
  ativo: ["sucesso", "Ativo"],
  expirado: ["neutro", "Vencido"],
  revogado: ["erro", "Revogado"],
};

export default function Links() {
  const { avisar } = useApp();
  const [links, setLinks] = useState<LinkExterno[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [revogar, setRevogar] = useState<LinkExterno | null>(null);
  const [indo, setIndo] = useState(false);

  const carregar = useCallback(() => {
    api<{ links: LinkExterno[] }>("links")
      .then((r) => { setLinks(r.links); setErro(null); })
      .catch((e: ErroApi) => { if (e.status !== 401) setErro(e.message); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const confirmar = async () => {
    if (!revogar) return;
    setIndo(true);
    try {
      await api("links", "POST", { acao: "revogar", id: revogar.id });
      avisar("Link revogado. Quem tiver o endereço não abre mais.");
      setRevogar(null);
      carregar();
    } catch (e) {
      if ((e as ErroApi).status !== 401) avisar((e as ErroApi).message);
    } finally {
      setIndo(false);
    }
  };

  return (
    <>
      <Cabecalho titulo="Links externos">
        <p className="mt-2 max-w-3xl text-sm text-secundario">
          Para agência e imprensa, só com arquivos de uso liberado. Para criar, na página do evento use "Selecionar" e "Link externo", ou abra a ficha do arquivo.
          O endereço aparece uma vez só, na criação.
        </p>
      </Cabecalho>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!erro && links === null && <Carregando />}
      {links?.length === 0 && <Aviso>Nenhum link criado ainda.</Aviso>}
      <ul className="space-y-3">
        {links?.map((l) => {
          const [tom, rotulo] = SITUACAO[l.situacao];
          return (
            <li key={l.id} className="rounded-grande border border-borda bg-superficie p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h2 className="min-w-0 break-words text-base font-bold text-titulo">{l.titulo}</h2>
                <Status tom={tom}>{rotulo}</Status>
              </div>
              <p className="mt-1 text-sm text-secundario">
                {l.destinatario ? `Para ${l.destinatario} · ` : ""}Criado por {l.criado_por_nome} em {quando(l.criado_em)}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div><dt className="text-secundario">Arquivos</dt><dd className="pi-num text-titulo">{l.arquivos}</dd></div>
                <div><dt className="text-secundario">Aberto</dt><dd className="pi-num text-titulo">{l.acessos === 1 ? "1 vez" : `${l.acessos} vezes`}</dd></div>
                <div><dt className="text-secundario">Downloads</dt><dd className="pi-num text-titulo">{l.downloads}</dd></div>
                <div><dt className="text-secundario">Senha</dt><dd className="text-titulo">{l.com_senha ? "Sim" : "Não"}</dd></div>
              </dl>
              <p className="mt-3 text-sm text-texto">
                {l.situacao === "revogado"
                  ? `Revogado em ${quando(l.revogado_em)}${l.revogado_por_nome ? ` por ${l.revogado_por_nome}` : ""}.`
                  : l.situacao === "expirado" ? `Venceu em ${quando(l.expira_em)}.` : `Vale até ${quando(l.expira_em)}.`}
                {l.ultimo_acesso_em ? ` Último acesso: ${quando(l.ultimo_acesso_em)}.` : " Ainda não foi aberto."}
              </p>
              {l.situacao === "ativo" && (
                <button type="button" className={`${BOTAO.texto} mt-3 text-erro-texto`} onClick={() => setRevogar(l)}>Revogar</button>
              )}
            </li>
          );
        })}
      </ul>
      {revogar && (
        <Janela aberta titulo="Revogar este link?" onFechar={() => setRevogar(null)}
          rodape={<>
            <button type="button" className={BOTAO.texto} onClick={() => setRevogar(null)}>Cancelar</button>
            <button type="button" className={BOTAO.perigo} disabled={indo} onClick={confirmar}>{indo ? "Revogando…" : "Revogar"}</button>
          </>}>
          <p className="text-sm text-texto">
            "{revogar.titulo}" para de abrir na hora, para todo mundo que tem o endereço. Não dá para desfazer: se precisar, crie outro link.
          </p>
        </Janela>
      )}
    </>
  );
}
