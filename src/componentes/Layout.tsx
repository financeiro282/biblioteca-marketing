import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { PORTAL_URL } from "../api";
import { useApp } from "../App";
import { pode, rotuloDoPerfil, type Permissao } from "../lib/dominio";
import { BOTAO, cn } from "./ui";

// Moldura dos sistemas, no desenho do MENU DO DASH (Lucas, 25/11/2026: "o layout, vamos seguir o exemplo do
// P:\Dash"). O Dash copiou o menu do Proposta Comercial (MolduraPainel.jsx) em 23/11; medidas e cores no
// LEIA-ME de P:\Dash\SISTEMA\backups\proposta-menu-padrao-20261119.
// - Aberta: a barra do padrão visual v1 (logo e nome do sistema no alto, grupos com título em caixa alta, só
//   texto, item ativo em bege com a faixa amarela de 2px; embaixo a pessoa, o perfil e "Voltar ao portal").
//   Sem "Sair": sai-se pelo Portal (decisão do Leo, 11/11).
// - Computador (>= 1024px): RECOLHIDA em 64px, só com ícones (Leo, 11/11/2026, a mesma regra do Dash, do
//   Proposta e da Precificação). Ao passar o mouse (espera de 120 ms) ou chegar pelo Tab, abre POR CIMA da
//   página com 240px; ao sair (espera de 200 ms) recolhe. O conteúdo fica sempre com recuo de 64px.
// - Celular (< 1024px): a barra vira o menu que abre por cima (botão "Menu"); Esc, o véu, "Fechar" ou
//   escolher um item fecham. Tudo o que é da barra recolhida tem o prefixo `lg:`: no celular nada muda.
// O menu mostra só o que o perfil pode usar; quem garante é o servidor e o banco.

type Item = { para: string; rotulo: string; icone: ReactNode; permissao?: Permissao; fim?: boolean };

// Ícones de traço fino (18px, traço 1,5), o mesmo desenho dos do Dash. Só aparecem na barra recolhida.
const Icone = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" className="block h-[18px] w-[18px]">{children}</svg>
);
const ICONE = {
  eventos: <Icone><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icone>,
  buscar: <Icone><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></Icone>,
  aprovadas: <Icone><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></Icone>,
  favoritos: <Icone><polygon points="12 3 14.8 8.7 21 9.6 16.5 14 17.6 20.2 12 17.3 6.4 20.2 7.5 14 3 9.6 9.2 8.7 12 3" /></Icone>,
  downloads: <Icone><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icone>,
  enviar: <Icone><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Icone>,
  links: <Icone><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></Icone>,
  uso: <Icone><path d="M4 20h16" /><path d="M7 16v-5M12 16V6M17 16v-8" /></Icone>,
  lixeira: <Icone><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></Icone>,
  log: <Icone><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Icone>,
  voltar: <Icone><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" /></Icone>,
};

const GERAL: Item[] = [
  { para: "/", rotulo: "Eventos", icone: ICONE.eventos, fim: true },
  { para: "/arquivos", rotulo: "Buscar arquivos", icone: ICONE.buscar },
  { para: "/aprovadas", rotulo: "Aprovadas para uso", icone: ICONE.aprovadas },
  { para: "/favoritos", rotulo: "Favoritos", icone: ICONE.favoritos },
  { para: "/downloads", rotulo: "Meus downloads", icone: ICONE.downloads },
];
const MARKETING: Item[] = [
  { para: "/enviar", rotulo: "Enviar arquivos", icone: ICONE.enviar, permissao: "enviar" },
  { para: "/links", rotulo: "Links externos", icone: ICONE.links, permissao: "compartilhar" },
  { para: "/uso", rotulo: "Painel de uso", icone: ICONE.uso, permissao: "ver_uso" },
];
const ADMINISTRACAO: Item[] = [
  { para: "/lixeira", rotulo: "Lixeira", icone: ICONE.lixeira, permissao: "lixeira" },
  { para: "/log", rotulo: "Log de ações", icone: ICONE.log, permissao: "relatorios" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);         // menu do celular
  const [expandida, setExpandida] = useState(false);   // barra do computador
  const espera = useRef<number>();
  const { pathname } = useLocation();
  const { eu } = useApp();
  useEffect(() => setAberto(false), [pathname]); // fecha o menu do celular ao navegar
  const doPerfil = (lista: Item[]) => lista.filter((i) => !i.permissao || pode(eu.perfil, i.permissao));

  // Esc fecha o menu do celular.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  // Espera para abrir (o mouse só passando a caminho de outro lugar não abre a barra) e para fechar
  // (escorregar um pixel para fora não fecha na hora). As mesmas do Dash e do Proposta.
  const expandir = (sim: boolean) => {
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setExpandida(sim), sim ? 120 : 200);
  };
  useEffect(() => () => window.clearTimeout(espera.current), []);

  // O foco pelo TECLADO abre na hora. O que vem do clique não abre: o mouse já cuida disso.
  const aoFocar = (e: FocusEvent<HTMLElement>) => {
    let peloTeclado = true;
    try { peloTeclado = e.target.matches(":focus-visible"); } catch { /* navegador antigo: abre */ }
    if (!peloTeclado) return;
    window.clearTimeout(espera.current);
    setExpandida(true);
  };
  const aoSairDoFoco = (e: FocusEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    window.clearTimeout(espera.current);
    setExpandida(false);
  };

  const curta = !expandida; // recolhida (só vale a partir de 1024px: todas as classes dela têm `lg:`)

  return (
    <div className="min-h-screen bg-fundo">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-borda bg-superficie px-4 py-3 lg:hidden">
        <Logo />
        <button type="button" onClick={() => setAberto(true)} aria-controls="menu-lateral" aria-expanded={aberto} className={BOTAO.texto}>Menu</button>
      </header>

      {aberto && <div className="fixed inset-0 z-40 bg-veu lg:hidden" onClick={() => setAberto(false)} aria-hidden="true" />}

      <aside
        id="menu-lateral"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-borda bg-superficie lg:translate-x-0",
          "lg:transition-[width,box-shadow] lg:duration-200 lg:ease-in-out motion-reduce:lg:transition-none",
          aberto ? "translate-x-0" : "-translate-x-full",
          curta ? "lg:w-16" : "lg:w-60 lg:shadow-[8px_0_30px_-12px_rgba(0,0,0,0.25)]",
        )}
        aria-label="Menu do sistema"
        onMouseEnter={() => expandir(true)} onMouseLeave={() => expandir(false)}
        onFocus={aoFocar} onBlur={aoSairDoFoco}
      >
        <div className={cn("flex h-16 shrink-0 items-center justify-between px-5 lg:overflow-hidden lg:whitespace-nowrap", curta && "lg:justify-center lg:px-0")}>
          <span className={cn("inline-flex", curta && "lg:hidden")}><Logo /></span>
          {/* Recolhida: o círculo da Importek (o mesmo do Dash, com o fundo transparente). */}
          <span className={cn("hidden", curta && "lg:inline-flex")} title="Biblioteca de Marketing">
            <img src={`${import.meta.env.BASE_URL}logo-circulo.png`} alt="Importek" width={32} height={32} className="block h-8 w-8" />
          </span>
          <button type="button" onClick={() => setAberto(false)} className={cn(BOTAO.texto, "lg:hidden")}>Fechar</button>
        </div>
        {/* Recolhida, o nome some mas guarda o lugar: os itens não sobem nem descem ao abrir. */}
        <p className={cn("-mt-2 shrink-0 px-5 pb-3 text-sm font-bold text-titulo lg:overflow-hidden lg:whitespace-nowrap", curta && "lg:invisible")}>
          Biblioteca de Marketing
        </p>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain pt-2 lg:overflow-x-hidden" aria-label="Principal">
          <Grupo titulo="Geral" itens={GERAL} curta={curta} primeiro />
          <Grupo titulo="Marketing" itens={doPerfil(MARKETING)} curta={curta} />
          <Grupo titulo="Administração" itens={doPerfil(ADMINISTRACAO)} curta={curta} />
        </nav>
        <Rodape curta={curta} />
      </aside>

      <main className="min-w-0 lg:pl-16">
        <div className="mx-auto w-full max-w-7xl px-4 pb-32 pt-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}

function Grupo({ titulo, itens, curta, primeiro }: { titulo: string; itens: Item[]; curta: boolean; primeiro?: boolean }) {
  const { pathname } = useLocation();
  if (!itens.length) return null;
  return (
    <>
      {/* Recolhida, o título some mas guarda o lugar; entre os grupos fica um traço curto. */}
      <p className={cn("relative px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-secundario lg:overflow-hidden lg:whitespace-nowrap", curta && "lg:invisible")}>
        {titulo}
        {!primeiro && <span aria-hidden="true" className={cn("absolute inset-x-5 top-1/2 hidden h-px bg-borda", curta && "lg:visible lg:block")} />}
      </p>
      {itens.map((i) => (
        <NavLink key={i.para} to={i.para} end={i.fim} title={i.rotulo} aria-label={i.rotulo}
          // "Eventos" continua marcado dentro de um evento (/evento/…).
          className={({ isActive }) => item(isActive || (i.para === "/" && pathname.startsWith("/evento/")), curta)}>
          <span aria-hidden="true" className={cn("hidden shrink-0", curta && "lg:inline-flex")}>{i.icone}</span>
          <span className={cn(curta && "lg:hidden")}>{i.rotulo}</span>
        </NavLink>
      ))}
    </>
  );
}

// Cabeçalho da página: título em 24px e as ações à direita (embaixo no celular).
export function Cabecalho({ titulo, acoes, antes, children }: { titulo: string; acoes?: ReactNode; antes?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {antes}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="break-words text-2xl font-bold text-titulo">{titulo}</h1>
        {acoes && <div className="flex flex-wrap gap-3">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" aria-label="Biblioteca de Marketing: início" className="inline-flex">
      <img src={`${import.meta.env.BASE_URL}logo-importek-cor.png`} alt="Importek" width={150} height={47} className="h-7 w-auto" />
    </Link>
  );
}

// Item da barra: o ativo leva o fundo bege e o amarelo só na faixa à esquerda. Recolhida, o ícone fica no meio
// dos 64px (o 2px da direita equilibra a faixa da esquerda). O contorno do foco fica por dentro: a barra corta o
// que passa da largura dela.
const item = (ativo: boolean, curta: boolean) =>
  cn("flex w-full items-center gap-2 border-l-2 px-5 py-2 text-left text-sm focus-visible:-outline-offset-2 lg:overflow-hidden lg:whitespace-nowrap",
    curta && "lg:justify-center lg:pl-0 lg:pr-0.5",
    ativo ? "border-marca bg-zebra font-semibold text-titulo" : "border-transparent text-texto hover:text-titulo hover:underline");

// Iniciais de quem entrou, para o círculo da barra recolhida ("Ana Paula Souza" → "AS").
function iniciais(nome: string) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function Rodape({ curta }: { curta: boolean }) {
  const { eu } = useApp();
  const perfil = rotuloDoPerfil(eu.perfil);
  return (
    <div className="shrink-0 border-t border-borda py-3">
      <div className={cn("px-5 pb-2 lg:overflow-hidden lg:whitespace-nowrap", curta && "lg:hidden")}>
        <p className="truncate text-sm font-semibold text-titulo">{eu.nome}</p>
        <p className="truncate text-xs text-secundario">{perfil}</p>
      </div>
      {/* Recolhida: as iniciais, na mesma altura do nome + perfil (20 + 16 + 8 px), para nada pular. */}
      <div className={cn("hidden h-11 items-center justify-center pb-2", curta && "lg:flex")} title={`${eu.nome} · ${perfil}`}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-borda bg-zebra text-xs font-bold text-titulo">
          {iniciais(eu.nome)}
        </span>
      </div>
      {/* SÓ "Voltar ao portal" (Leo, 11/11/2026: quem encerra a sessão é o "Sair" do Portal, que derruba tudo). */}
      <a href={PORTAL_URL} title="Voltar ao portal" aria-label="Voltar ao portal" className={item(false, curta)}>
        <span aria-hidden="true" className={cn("hidden shrink-0", curta && "lg:inline-flex")}>{ICONE.voltar}</span>
        <span className={cn(curta && "lg:hidden")}>Voltar ao portal</span>
      </a>
    </div>
  );
}
