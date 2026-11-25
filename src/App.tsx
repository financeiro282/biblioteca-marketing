import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, ErroApi, irAoPortal, PORTAL_URL } from "./api";
import Layout from "./componentes/Layout";
import { CartaoEntrada, entradaRecente } from "./componentes/CartaoEntrada";
import { BOTAO, Carregando } from "./componentes/ui";
import { pode, type Eu, type Permissao } from "./lib/dominio";
import EntrarPortal from "./paginas/EntrarPortal";
import Eventos from "./paginas/Eventos";
import Evento from "./paginas/Evento";
import Arquivos from "./paginas/Arquivos";
import Arquivo from "./paginas/Arquivo";
import EmBreve from "./paginas/EmBreve";

// ── Contexto: quem está aqui e o aviso flutuante ──
type Ctx = { eu: Eu; avisar: (msg: string) => void };
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

// Atividade (mexer na página) avisa o servidor no máximo a cada 2 min: é o que segura os 30 minutos de
// inatividade, contados no BANCO (função sessao_conferir). Sessão encerrada fora daqui ("Sair" no Portal) aparece no
// primeiro aviso → volta ao Portal.
const EVENTOS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
function useAtividade(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    let ultimo = Date.now();
    const mexeu = () => {
      if (Date.now() - ultimo < 120_000) return;
      ultimo = Date.now();
      api("sessao").catch(() => { /* 401 já leva ao Portal */ });
    };
    const voltou = () => { if (document.visibilityState === "visible") { ultimo = 0; mexeu(); } };
    EVENTOS.forEach((e) => window.addEventListener(e, mexeu, { passive: true }));
    document.addEventListener("visibilitychange", voltou);
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, mexeu));
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [ativo]);
}

// Tela que pede uma permissão: sem ela, volta para a inicial (o servidor e o banco recusam de qualquer jeito).
function ComPermissao({ permissao, children }: { permissao: Permissao; children: ReactNode }) {
  const { eu } = useApp();
  return pode(eu.perfil, permissao) ? <>{children}</> : <Navigate to="/" replace />;
}

function Protegido() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const timer = useRef<number>();
  const local = useLocation();

  const avisar = useCallback((msg: string) => {
    setAviso(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAviso(null), 3500);
  }, []);
  useAtividade(!!eu);

  useEffect(() => {
    api<Eu>("sessao")
      .then(setEu)
      .catch((e: ErroApi) => {
        if (e.status === 401 && irAoPortal(local.pathname + local.search)) return;
        setErro(e.status === 401
          ? "Não foi possível manter a sua entrada neste navegador (cookies bloqueados?). Abra a Biblioteca de novo pelo Portal."
          : e.message);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-entrada rounded-grande border border-borda bg-superficie p-6 text-center">
          <p className="font-semibold text-titulo">{erro}</p>
          <a href={PORTAL_URL} className={`${BOTAO.principal} mt-5`}>Ir ao Portal</a>
        </div>
      </div>
    );
  }
  if (!eu) {
    const recem = entradaRecente(); // acabou de entrar pelo Portal → o MESMO cartão do clique
    return recem ? <CartaoEntrada sistema={recem} /> : <div className="flex min-h-screen items-center justify-center"><Carregando /></div>;
  }

  return (
    <AppCtx.Provider value={{ eu, avisar }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Eventos />} />
          <Route path="/evento/novo" element={<ComPermissao permissao="organizar"><EmBreve titulo="Novo evento" fase={3} itens={[
            "Nome, data, local, descrição, tags, responsável e capa.",
            "Direito de uso do evento (Uso liberado, Somente uso interno ou Sem autorização), escolhido sempre.",
          ]} /></ComPermissao>} />
          <Route path="/evento/:id" element={<Evento />} />
          <Route path="/arquivos" element={<Arquivos modo="busca" />} />
          <Route path="/favoritos" element={<Arquivos modo="favoritos" />} />
          <Route path="/aprovadas" element={<Arquivos modo="aprovadas" />} />
          <Route path="/arquivo/:id" element={<Arquivo />} />
          <Route path="/downloads" element={<EmBreve titulo="Meus downloads" fase={4} itens={[
            "Zips pedidos (um ou vários arquivos), gerados em segundo plano.",
            "Aviso pelo Portal (sininho e notificação) quando o zip ficar pronto. Cada zip fica 7 dias.",
          ]} />} />
          <Route path="/enviar" element={<ComPermissao permissao="enviar"><EmBreve titulo="Enviar arquivos" fase={2} itens={[
            "Arrastar e soltar centenas de fotos ou vídeos grandes de uma vez.",
            "Envio direto para o armazenamento, em partes, com progresso e retomada se a conexão cair.",
            "Aviso de arquivo já enviado (duplicado) e de que fechar a aba interrompe o envio.",
            "Miniatura, data de captura e prévia de HEIC geradas no envio.",
          ]} /></ComPermissao>} />
          <Route path="/links" element={<ComPermissao permissao="compartilhar"><EmBreve titulo="Links externos" fase={4} itens={[
            "Link para agência ou imprensa com validade (até 90 dias), senha opcional e revogação.",
            "Só arquivos com uso liberado. Toda abertura e download registrados no log.",
          ]} /></ComPermissao>} />
          <Route path="/uso" element={<ComPermissao permissao="ver_uso"><EmBreve titulo="Painel de uso" fase={5} itens={[
            "Espaço por evento e total, crescimento mensal e custo estimado do mês.",
            "Alertas ao passar dos limites configurados (ex.: 1 TB, 2 TB).",
            "Conferência diária com o espaço real ocupado no armazenamento.",
          ]} /></ComPermissao>} />
          <Route path="/lixeira" element={<ComPermissao permissao="lixeira"><EmBreve titulo="Lixeira" fase={5} itens={[
            "Arquivos e eventos excluídos ficam 30 dias antes de serem apagados de vez.",
            "Restaurar: só o Administrador.",
          ]} /></ComPermissao>} />
          <Route path="/log" element={<ComPermissao permissao="relatorios"><EmBreve titulo="Log de ações" fase={5} itens={[
            "Quem enviou, baixou, compartilhou, excluiu e restaurou, e quando.",
          ]} /></ComPermissao>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      {aviso && (
        <div role="status" className="fixed left-1/2 top-4 z-[60] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded border border-borda-forte bg-superficie px-4 py-3 text-sm text-titulo">
          {aviso}
        </div>
      )}
    </AppCtx.Provider>
  );
}

// O passe do Portal pode chegar em QUALQUER página (#passe=…), como nos outros sistemas.
const chegouComPasse = () => /(^|&)passe=/.test(window.location.hash.slice(1));

export default function App() {
  useLocation(); // redesenha quando a entrada termina (o passe sai da barra) — sem recarregar a página
  if (chegouComPasse()) return <EntrarPortal />;
  return (
    <Routes>
      <Route path="/entrar-portal" element={<EntrarPortal />} />
      <Route path="/*" element={<Protegido />} />
    </Routes>
  );
}
