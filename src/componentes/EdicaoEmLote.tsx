import { useState, type FormEvent } from "react";
import { api, ErroApi } from "../api";
import { Aviso, BOTAO, CAMPO, Campo, Janela, LISTA, cn } from "./ui";

// Janelas do modo seleção (Fase 3): mudar vários arquivos de uma vez e mandar para a lixeira.
// Só muda o que for escolhido ("Não mudar" fica como está). A regra é a de compartilhado/arquivo.js, no servidor.

type Resumo = { alterados: number; conflitos: number; sem_autorizacao: number; nao_encontrados: number };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function resumoDoLote(r: Resumo) {
  const partes = [`${plural(r.alterados, "arquivo alterado", "arquivos alterados")}.`];
  if (r.sem_autorizacao) partes.push(r.sem_autorizacao === 1 ? '1 não foi aprovado: está "Sem autorização".' : `${r.sem_autorizacao} não foram aprovados: estão "Sem autorização".`);
  if (r.conflitos) partes.push(`${plural(r.conflitos, "foi alterado", "foram alterados")} por outra pessoa no meio e ficaram como estavam.`);
  return partes.join(" ");
}

export function EdicaoEmLote({ ids, onFechar, onFeito }: { ids: string[]; onFechar: () => void; onFeito: (resumo: string) => void }) {
  const [direito, setDireito] = useState("");
  const [aprovacao, setAprovacao] = useState("");
  const [trocarAutor, setTrocarAutor] = useState(false);
  const [autor, setAutor] = useState("");
  const [mais, setMais] = useState("");
  const [menos, setMenos] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar: Record<string, unknown> = {};
  if (direito) mudar.direito_uso = direito;
  if (aprovacao) mudar.aprovada = aprovacao === "aprovar";
  if (trocarAutor) mudar.autor = autor;
  if (mais.trim()) mudar.tags_mais = mais;
  if (menos.trim()) mudar.tags_menos = menos;
  const nada = Object.keys(mudar).length === 0;

  async function aplicar(e?: FormEvent) {
    e?.preventDefault();
    if (nada || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await api<Resumo>("arquivos", "POST", { acao: "lote", ids, mudar });
      onFeito(resumoDoLote(r));
    } catch (x) {
      if ((x as ErroApi).status !== 401) setErro((x as ErroApi).message);
      setSalvando(false);
    }
  }

  return (
    <Janela aberta titulo={`Editar ${plural(ids.length, "arquivo", "arquivos")}`} onFechar={onFechar}
      rodape={<>
        <button type="button" className={BOTAO.texto} onClick={onFechar}>Cancelar</button>
        <button type="button" className={BOTAO.principal} disabled={nada || salvando} onClick={() => aplicar()}>{salvando ? "Aplicando…" : "Aplicar"}</button>
      </>}>
      <form onSubmit={aplicar} className="space-y-4">
        <p className="text-sm text-secundario">Só muda o que você escolher. O resto fica como está em cada arquivo.</p>
        <Campo id="lote-direito" rotulo="Direito de uso" ajuda="Vale o mais restrito entre o evento e o arquivo.">
          <select id="lote-direito" className={cn(LISTA, "sm:w-full")} value={direito} onChange={(e) => setDireito(e.target.value)}>
            <option value="">Não mudar</option>
            <option value="liberado">Igual ao do evento</option>
            <option value="interno">Somente uso interno</option>
            <option value="sem_autorizacao">Sem autorização</option>
          </select>
        </Campo>
        <Campo id="lote-aprovacao" rotulo="Aprovadas para uso" ajuda='Arquivo "Sem autorização" não é aprovado.'>
          <select id="lote-aprovacao" className={cn(LISTA, "sm:w-full")} value={aprovacao} onChange={(e) => setAprovacao(e.target.value)}>
            <option value="">Não mudar</option>
            <option value="aprovar">Aprovar para uso</option>
            <option value="tirar">Tirar a aprovação</option>
          </select>
        </Campo>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-titulo">
            <input type="checkbox" checked={trocarAutor} onChange={(e) => setTrocarAutor(e.target.checked)} className="h-4 w-4 accent-[var(--cor-titulo)]" />
            Trocar o autor
          </label>
          {trocarAutor && <input aria-label="Autor" className={CAMPO} value={autor} maxLength={200} placeholder="Vazio apaga o autor" onChange={(e) => setAutor(e.target.value)} />}
        </div>
        <Campo id="lote-mais" rotulo="Acrescentar tags" ajuda="Separe por vírgula.">
          <input id="lote-mais" className={CAMPO} value={mais} onChange={(e) => setMais(e.target.value)} />
        </Campo>
        <Campo id="lote-menos" rotulo="Tirar tags" ajuda="Separe por vírgula.">
          <input id="lote-menos" className={CAMPO} value={menos} onChange={(e) => setMenos(e.target.value)} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

/** Confirmação para mandar arquivos (ou um evento) para a lixeira. */
export function ConfirmarLixeira({ titulo, texto, onFechar, onConfirmar }: {
  titulo: string; texto: React.ReactNode; onFechar: () => void; onConfirmar: () => Promise<void>;
}) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = async () => {
    setIndo(true);
    setErro(null);
    try { await onConfirmar(); } catch (x) { if ((x as ErroApi).status !== 401) setErro((x as ErroApi).message); setIndo(false); }
  };
  return (
    <Janela aberta titulo={titulo} onFechar={onFechar}
      rodape={<>
        <button type="button" className={BOTAO.texto} onClick={onFechar}>Cancelar</button>
        <button type="button" className={BOTAO.perigo} disabled={indo} onClick={confirmar}>{indo ? "Mandando…" : "Mandar para a lixeira"}</button>
      </>}>
      <div className="space-y-3 text-sm text-texto">
        {texto}
        <p className="text-secundario">O Administrador pode restaurar em até 30 dias. Depois disso, é apagado de vez.</p>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Janela>
  );
}
