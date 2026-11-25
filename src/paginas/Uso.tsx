import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ErroApi } from "../api";
import { useApp } from "../App";
import { Cabecalho } from "../componentes/Layout";
import { Aviso, BOTAO, CAMPO, Campo, Carregando, Janela } from "../componentes/ui";
import { dolar, type Painel } from "../lib/controle";
import { dataCurta, tamanhoLegivel } from "../lib/dominio";
import { quando } from "../lib/download";

// Painel de uso (Fase 5): Marketing e Administrador. O espaço vem da medição diária (8h): a soma REAL do
// armazenamento (R2) conferida com o cadastro. Custo estimado com os preços da configuração (sem impostos e IOF).

const TIPO: Record<string, string> = { foto: "Fotos", video: "Vídeos", raw: "RAW" };
const mesAno = (iso: string) => { const [a, m] = iso.split("-"); return `${m}/${a}`; };

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-grande border border-borda bg-superficie p-4">
      <p className="text-sm text-secundario">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-titulo pi-num">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-secundario">{detalhe}</p>}
    </div>
  );
}

export default function Uso() {
  const { avisar } = useApp();
  const [p, setP] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [configurando, setConfigurando] = useState(false);

  const carregar = useCallback(() => {
    api<Painel>("controle?rota=uso").then((r) => { setP(r); setErro(null); }).catch((e: ErroApi) => { if (e.status !== 401) setErro(e.message); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const medir = async () => {
    setMedindo(true);
    try { await api("controle", "POST", { acao: "medir_uso" }); avisar("Uso medido agora."); carregar(); }
    catch (e) { if ((e as ErroApi).status !== 401) avisar((e as ErroApi).message); }
    finally { setMedindo(false); }
  };

  const h = p?.hoje;
  const total = h ? (h.bytes_r2 ?? h.bytes_banco) : 0;
  const diferenca = h && h.bytes_r2 !== null ? h.bytes_r2 - h.bytes_banco : null;

  return (
    <>
      <Cabecalho titulo="Painel de uso" acoes={p?.pode_configurar ? <>
        <button type="button" className={BOTAO.contorno} disabled={medindo} onClick={medir}>{medindo ? "Medindo…" : "Medir agora"}</button>
        <button type="button" className={BOTAO.contorno} onClick={() => setConfigurando(true)}>Alertas e preços</button>
      </> : undefined}>
        <p className="mt-2 max-w-3xl text-sm text-secundario">Medido todo dia às 8h: a soma real do armazenamento, conferida com o cadastro.</p>
      </Cabecalho>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!erro && !p && <Carregando />}
      {p && !h && <Aviso>Ainda não houve medição. A primeira sai amanhã às 8h{p.pode_configurar ? ', ou agora em "Medir agora"' : ""}.</Aviso>}
      {p && h && (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Espaço ocupado" valor={tamanhoLegivel(total)} detalhe={`Medido em ${quando(h.registrado_em)}`} />
            <Numero rotulo="Custo estimado por mês" valor={p.custo ? dolar(p.custo.total) : "—"}
              detalhe={p.custo ? `Armazenamento ${dolar(p.custo.principal)} · cópia ${dolar(p.custo.copia)}. Sem impostos e IOF.` : undefined} />
            <Numero rotulo="Arquivos" valor={h.arquivos_banco.toLocaleString("pt-BR")} detalhe={Object.entries(h.por_tipo ?? {}).map(([t, b]) => `${TIPO[t] ?? t} ${tamanhoLegivel(Number(b))}`).join(" · ")} />
            <Numero rotulo="Na lixeira" valor={tamanhoLegivel(h.bytes_lixeira)} detalhe="Sai sozinho depois de 30 dias." />
          </div>

          <section>
            <h2 className="mb-2 text-base font-bold text-titulo">Conferência</h2>
            <p className="text-sm text-texto">
              Cadastro: {tamanhoLegivel(h.bytes_banco)} (originais). Armazenamento real:{" "}
              {h.bytes_r2 === null ? "não medido (armazenamento indisponível na medição)" : `${tamanhoLegivel(h.bytes_r2)} em ${h.objetos_r2?.toLocaleString("pt-BR")} objetos`}.
            </p>
            {diferenca !== null && (
              <p className="mt-1 text-sm text-secundario">
                A diferença ({tamanhoLegivel(Math.abs(diferenca))}) são as miniaturas, as prévias e os zips dos últimos 7 dias{diferenca < 0 ? ". Atenção: o real está menor que o cadastro. Avise o responsável pelo sistema." : "."}
              </p>
            )}
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-base font-bold text-titulo">Crescimento por mês</h2>
              {p.por_mes.length === 0 ? <p className="text-sm text-secundario">Nenhum envio ainda.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-borda text-left text-secundario"><th className="py-2 font-semibold">Mês</th><th className="py-2 text-right font-semibold">Arquivos</th><th className="py-2 text-right font-semibold">Tamanho</th></tr></thead>
                  <tbody>
                    {[...p.por_mes].reverse().map((m) => (
                      <tr key={m.mes} className="border-b border-borda last:border-0">
                        <td className="py-2 text-titulo pi-num">{mesAno(m.mes)}</td>
                        <td className="py-2 text-right pi-num">{m.arquivos.toLocaleString("pt-BR")}</td>
                        <td className="py-2 text-right pi-num">{tamanhoLegivel(m.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <h2 className="mb-2 text-base font-bold text-titulo">Maiores eventos</h2>
              <table className="w-full table-fixed text-sm">
                <thead><tr className="border-b border-borda text-left text-secundario"><th className="py-2 font-semibold">Evento</th><th className="w-20 py-2 text-right font-semibold">Arquivos</th><th className="w-24 py-2 text-right font-semibold">Tamanho</th></tr></thead>
                <tbody>
                  {p.maiores.map((e) => (
                    <tr key={e.id} className="border-b border-borda last:border-0">
                      <td className="truncate py-2 pr-2 text-titulo" title={e.nome}>{e.nome} <span className="text-secundario">({dataCurta(e.data_evento)})</span></td>
                      <td className="py-2 text-right pi-num">{e.arquivos.toLocaleString("pt-BR")}</td>
                      <td className="py-2 text-right pi-num">{tamanhoLegivel(e.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section>
            <h2 className="mb-2 text-base font-bold text-titulo">Alertas</h2>
            <p className="text-sm text-texto">
              {p.config?.limites_alerta_gb.length
                ? <>Avisa os Administradores pelo Portal ao passar de {p.config.limites_alerta_gb.map((l) => `${l.toLocaleString("pt-BR")} GB`).join(", ")}.</>
                : "Nenhum limite de alerta configurado."}
              {p.alertas.length > 0 && <> Já avisados: {p.alertas.map((a) => `${a.limite_gb.toLocaleString("pt-BR")} GB em ${quando(a.avisado_em)}`).join("; ")}.</>}
            </p>
          </section>
        </div>
      )}
      {configurando && p?.config && <Configurar atual={p.config} onFechar={() => setConfigurando(false)} onSalvo={() => { setConfigurando(false); avisar("Configuração salva."); carregar(); }} />}
    </>
  );
}

function Configurar({ atual, onFechar, onSalvo }: { atual: NonNullable<Painel["config"]>; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState({
    limites_alerta_gb: atual.limites_alerta_gb.join(", "),
    preco_principal_gb: String(atual.preco_principal_gb), gratis_principal_gb: String(atual.gratis_principal_gb),
    preco_copia_gb: String(atual.preco_copia_gb), gratis_copia_gb: String(atual.gratis_copia_gb),
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof typeof v) => ({ id: `cfg-${k}`, className: CAMPO, value: v[k], onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })) });
  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    setSalvando(true);
    try { await api("controle", "POST", { acao: "config", ...v }); onSalvo(); }
    catch (x) { if ((x as ErroApi).status !== 401) setErros((x as ErroApi).erros ?? { geral: (x as ErroApi).message }); setSalvando(false); }
  }
  return (
    <Janela aberta titulo="Alertas e preços" onFechar={onFechar}
      rodape={<><button type="button" className={BOTAO.texto} onClick={onFechar}>Cancelar</button><button type="button" className={BOTAO.principal} disabled={salvando} onClick={() => salvar()}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo id="cfg-limites_alerta_gb" rotulo="Limites de alerta (GB)" ajuda={erros.limites_alerta_gb ?? "Separados por vírgula. Cada limite avisa uma vez."}>
          <input {...campo("limites_alerta_gb")} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="cfg-preco_principal_gb" rotulo="Armazenamento: US$ por GB/mês" ajuda={erros.preco_principal_gb}><input {...campo("preco_principal_gb")} inputMode="decimal" /></Campo>
          <Campo id="cfg-gratis_principal_gb" rotulo="Armazenamento: GB grátis" ajuda={erros.gratis_principal_gb}><input {...campo("gratis_principal_gb")} inputMode="decimal" /></Campo>
          <Campo id="cfg-preco_copia_gb" rotulo="Cópia: US$ por GB/mês" ajuda={erros.preco_copia_gb}><input {...campo("preco_copia_gb")} inputMode="decimal" /></Campo>
          <Campo id="cfg-gratis_copia_gb" rotulo="Cópia: GB grátis" ajuda={erros.gratis_copia_gb}><input {...campo("gratis_copia_gb")} inputMode="decimal" /></Campo>
        </div>
        {erros.geral && <Aviso tom="erro">{erros.geral}</Aviso>}
      </form>
    </Janela>
  );
}
