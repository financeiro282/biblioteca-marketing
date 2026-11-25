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
import EventoFormulario from "./paginas/EventoFormulario";
import Arquivos from "./paginas/Arquivos";
import Arquivo from "./paginas/Arquivo";
import Enviar from "./paginas/Enviar";
import Downloads from "./paginas/Downloads";
import Links from "./paginas/Links";
import LinkExterno from "./paginas/LinkExterno";
import Lixeira from "./paginas/Lixeira";
import Log from "./paginas/Log";
import Uso from "./paginas/Uso";

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
          <Route path="/evento/novo" element={<ComPermissao permissao="organizar"><EventoFormulario modo="novo" /></ComPermissao>} />
          <Route path="/evento/:id/editar" element={<ComPermissao permissao="organizar"><EventoFormulario modo="editar" /></ComPermissao>} />
          <Route path="/evento/:id" element={<Evento />} />
          <Route path="/arquivos" element={<Arquivos modo="busca" />} />
          <Route path="/favoritos" element={<Arquivos modo="favoritos" />} />
          <Route path="/aprovadas" element={<Arquivos modo="aprovadas" />} />
          <Route path="/arquivo/:id" element={<Arquivo />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/enviar" element={<ComPermissao permissao="enviar"><Enviar /></ComPermissao>} />
          <Route path="/links" element={<ComPermissao permissao="compartilhar"><Links /></ComPermissao>} />
          <Route path="/uso" element={<ComPermissao permissao="ver_uso"><Uso /></ComPermissao>} />
          <Route path="/lixeira" element={<ComPermissao permissao="lixeira"><Lixeira /></ComPermissao>} />
          <Route path="/log" element={<ComPermissao permissao="relatorios"><Log /></ComPermissao>} />
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
      {/* Link externo (Fase 4): página PÚBLICA, sem sessão nem menu — quem abre não tem conta no Portal. */}
      <Route path="/l" element={<LinkExterno />} />
      <Route path="/*" element={<Protegido />} />
    </Routes>
  );
}
