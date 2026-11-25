import { useEffect } from "react";

// Peças visuais: as mesmas do Portal (portal-importek/src/componentes/ui.tsx), padrão visual v1.
// Uma ação principal por tela (BOTAO.principal); as demais em contorno ou texto; ação destrutiva
// em BOTAO.perigo, só dentro da janela de confirmação.

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const BOTAO = {
  principal: "inline-flex h-10 items-center justify-center whitespace-nowrap rounded border border-marca bg-marca px-4 text-sm font-semibold text-sobre-marca hover:border-marca-hover hover:bg-marca-hover disabled:cursor-not-allowed disabled:border-borda disabled:bg-borda disabled:text-apagado",
  contorno: "inline-flex h-10 items-center justify-center whitespace-nowrap rounded border border-borda-campo bg-superficie px-4 text-sm font-semibold text-titulo hover:border-titulo disabled:cursor-not-allowed disabled:border-borda disabled:text-apagado",
  texto: "inline-flex items-center whitespace-nowrap text-sm font-semibold text-titulo underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-apagado disabled:no-underline",
  perigo: "inline-flex h-10 items-center justify-center whitespace-nowrap rounded border border-erro-texto bg-superficie px-4 text-sm font-semibold text-erro-texto hover:bg-zebra disabled:cursor-not-allowed disabled:border-borda disabled:text-apagado",
};

// text-base (16px) nos campos: menor que isso o celular dá zoom ao tocar.
export const CAMPO = "h-10 w-full rounded border border-borda-campo bg-superficie px-3 text-base text-titulo placeholder:text-apagado focus:border-titulo focus:outline-none disabled:bg-zebra";
export const AREA = "min-h-[80px] w-full resize-y rounded border border-borda-campo bg-superficie px-3 py-2 text-base text-titulo placeholder:text-apagado focus:border-titulo focus:outline-none";

// Rótulo acima, campo, e o erro (ou uma linha de orientação) abaixo.
export function Campo({ id, rotulo, ajuda, className, children }: {
  id: string; rotulo: React.ReactNode; ajuda?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-titulo">{rotulo}</label>
      {children}
      {ajuda ? <p className="text-xs text-secundario">{ajuda}</p> : null}
    </div>
  );
}

// Situação: círculo pequeno de cor sólida + palavra curta.
const TOM = { sucesso: "bg-sucesso", alerta: "bg-alerta", erro: "bg-erro", neutro: "bg-apagado" } as const;
export type Tom = keyof typeof TOM;
export function Status({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-texto">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", TOM[tom])} aria-hidden="true" />{children}
    </span>
  );
}

// Aviso de texto (sem ícone): faixa à esquerda na cor do tom.
export function Aviso({ tom = "neutro", children }: { tom?: "neutro" | "alerta" | "erro"; children: React.ReactNode }) {
  const faixa = { neutro: "border-l-borda-campo", alerta: "border-l-alerta", erro: "border-l-erro" }[tom];
  return (
    <div role={tom === "neutro" ? "status" : "alert"} className={cn("rounded border border-l-2 border-borda bg-superficie px-4 py-3 text-sm leading-relaxed text-texto", faixa)}>
      {children}
    </div>
  );
}

export function Cartao({ titulo, children, acoes }: { titulo?: string; children: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <section className="rounded-grande border border-borda bg-superficie p-5 md:p-6">
      {(titulo || acoes) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {titulo && <h2 className="text-base font-bold text-titulo">{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <p role="status" className="py-10 text-center text-sm text-secundario">{texto}</p>;
}

// Data e hora no padrão das telas: dd/mm/aaaa HH:MM.
export function dataHora(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Janela simples (sem biblioteca): fecha no Esc e no fundo; trava a rolagem da página.
export function Janela({ aberta, titulo, onFechar, children, rodape, largura = "max-w-lg" }: {
  aberta: boolean; titulo: string; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode; largura?: string;
}) {
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = antes; };
  }, [aberta, onFechar]);
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-veu sm:items-center sm:p-4" onMouseDown={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}
        className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-grande border border-borda bg-superficie shadow-janela sm:rounded-grande", largura)}>
        <header className="flex items-center justify-between gap-4 border-b border-borda px-5 py-3.5">
          <h2 className="text-base font-bold text-titulo">{titulo}</h2>
          <button type="button" onClick={onFechar} className={BOTAO.texto}>Fechar</button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {rodape && <footer className="flex flex-wrap justify-end gap-3 border-t border-borda px-5 py-3.5">{rodape}</footer>}
      </div>
    </div>
  );
}

// ── Biblioteca ──────────────────────────────────────────────────────────────

// Lista suspensa no mesmo estilo dos campos.
export const LISTA = "h-10 w-full rounded border border-borda-campo bg-superficie px-3 text-base text-titulo focus:border-titulo focus:outline-none sm:w-auto";

// Etiqueta pequena sobre a miniatura (texto, sem ícone): fundo escuro sólido (as cores do padrão são variáveis: sem transparência), legível sobre qualquer foto.
export function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("pointer-events-none rounded bg-titulo px-1.5 py-0.5 text-xs font-semibold text-superficie", className)}>
      {children}
    </span>
  );
}
