/* eslint-disable react-refresh/only-export-components -- a página e o texto do aviso andam juntos */
import { Cabecalho } from "../componentes/Layout";
import { Aviso } from "../componentes/ui";

// Telas das próximas fases do plano (aprovado pelo Lucas em 24/11/2026). Ficam no menu desde já para a aprovação
// do layout na Fase 1; cada uma diz em que fase entra.
export const FASES: Record<number, string> = {
  2: "Fase 2 — envio de arquivos",
  3: "Fase 3 — organização (eventos, tags, direito de uso, favoritos e aprovadas)",
  4: "Fase 4 — download e compartilhamento",
  5: "Fase 5 — lixeira, painel de uso e log",
};

export const emBreve = (fase: number) => `Disponível na ${FASES[fase] ?? `Fase ${fase}`}.`;

export default function EmBreve({ titulo, fase, itens }: { titulo: string; fase: number; itens: string[] }) {
  return (
    <>
      <Cabecalho titulo={titulo} />
      <Aviso>Esta tela entra na {FASES[fase]}.</Aviso>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-texto">
        {itens.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </>
  );
}
