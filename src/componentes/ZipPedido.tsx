import { useState } from "react";
import { Link } from "react-router-dom";
import { ErroApi } from "../api";
import { useApp } from "../App";
import { baixarOriginal, VALIDADE_ZIP_DIAS, type ArquivoFora, type PedidoDeZip } from "../lib/download";
import { tamanhoLegivel } from "../lib/dominio";
import { BOTAO, Janela } from "./ui";

// Depois de pedir um zip (Fase 4): o que vai acontecer e os arquivos grandes que baixam direto.

/** Arquivos acima de 1 GB: não entram no zip; cada um tem o seu "Baixar". */
export function ListaFora({ fora }: { fora: ArquivoFora[] }) {
  const { avisar } = useApp();
  const [baixando, setBaixando] = useState<string | null>(null);
  const baixar = async (id: string) => {
    setBaixando(id);
    try { await baixarOriginal(id); } catch (e) { if ((e as ErroApi).status !== 401) avisar((e as ErroApi).message); } finally { setBaixando(null); }
  };
  return (
    <ul className="divide-y divide-borda rounded border border-borda">
      {fora.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0 truncate text-sm text-titulo" title={f.nome_original}>
            {f.nome_original} <span className="text-secundario">· {tamanhoLegivel(f.tamanho_bytes)}</span>
          </span>
          <button type="button" className={BOTAO.texto} disabled={baixando === f.id} onClick={() => baixar(f.id)}>
            {baixando === f.id ? "Abrindo…" : "Baixar"}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ZipPedido({ resultado, onFechar }: { resultado: PedidoDeZip; onFechar: () => void }) {
  const { zip, fora } = resultado;
  return (
    <Janela aberta titulo={zip ? "Zip pedido" : "Arquivos grandes: baixe direto"} onFechar={onFechar}
      rodape={<>
        {zip && <Link to="/downloads" className={BOTAO.contorno} onClick={onFechar}>Ver Meus downloads</Link>}
        <button type="button" className={BOTAO.principal} onClick={onFechar}>Entendi</button>
      </>}>
      <div className="space-y-4 text-sm text-texto">
        {zip && (
          <>
            <p>
              O zip de <strong className="text-titulo">{zip.total_arquivos === 1 ? "1 arquivo" : `${zip.total_arquivos} arquivos`}</strong>{" "}
              ({tamanhoLegivel(zip.total_bytes)}) está sendo preparado
              {zip.partes.length > 1 ? `, em ${zip.partes.length} partes de até 2 GB` : ""}.
            </p>
            <p>Pode continuar usando a biblioteca ou fechar a página. Quando ficar pronto, chega um aviso pelo Portal, e ele fica em Meus downloads por {VALIDADE_ZIP_DIAS} dias.</p>
          </>
        )}
        {fora.length > 0 && (
          <>
            <p>{zip ? "Estes arquivos têm mais de 1 GB e não entram no zip. Baixe cada um direto:" : "Os arquivos escolhidos têm mais de 1 GB e não entram em zip. Baixe cada um direto:"}</p>
            <ListaFora fora={fora} />
          </>
        )}
      </div>
    </Janela>
  );
}
