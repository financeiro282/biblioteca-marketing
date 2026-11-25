import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE, caminhoNoApp, limparIdaAoPortal, PORTAL_URL, urlNoApp } from "../api";
import { CartaoEntrada, marcarEntrada, nomeDoSistema } from "../componentes/CartaoEntrada";
import { BOTAO } from "../componentes/ui";

// /entrar-portal#passe=…[&volta=/caminho] — quem vem do Portal Importek chega aqui (ou o passe chega em qualquer
// página: App.tsx). O passe vem no FRAGMENTO (não vai a servidor nenhum sozinho); a página o tira da barra na hora e
// o manda ao servidor deste sistema, que troca com o Portal e grava o cookie de sessão. Contrato dos sistemas, item 1.
// Enquanto isso: o MESMO cartão que o Portal mostrou no clique.

export default function EntrarPortal() {
  const [erro, setErro] = useState<string | null>(null);
  const [sistema] = useState(() => nomeDoSistema("Biblioteca de Marketing")); // antes de o passe sair da barra
  const navegar = useNavigate();
  const feito = useRef(false); // o StrictMode roda o efeito duas vezes; o passe só vale uma

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    const frag = new URLSearchParams(window.location.hash.slice(1));
    const passe = frag.get("passe");
    const aqui = caminhoNoApp();
    const volta = frag.get("volta") ?? (aqui === "/entrar-portal" ? "/" : aqui);
    window.history.replaceState(null, "", urlNoApp(volta.startsWith("/") ? volta : "/"));
    if (!passe) { setErro("Link de entrada incompleto. Abra a Biblioteca de novo pelo Portal."); return; }
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/sessao`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
          body: JSON.stringify({ acao: "entrar", passe, volta }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || "Não foi possível entrar.");
        limparIdaAoPortal();
        marcarEntrada(sistema);
        navegar(j.volta || "/", { replace: true });
      } catch (e) {
        setErro((e as Error).message === "Failed to fetch" ? "Sem conexão com o servidor. Tente de novo pelo Portal." : (e as Error).message);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!erro) return <CartaoEntrada sistema={sistema} />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-entrada">
        <img src={`${import.meta.env.BASE_URL}logo-importek-cor.png`} alt="Importek" width={150} height={47} className="mx-auto h-8 w-auto" />
        <div className="mt-6 rounded-grande border border-borda bg-superficie p-6 text-center sm:p-8">
          <p role="alert" className="font-semibold text-titulo">{erro}</p>
          <a href={PORTAL_URL} className={`${BOTAO.principal} mt-6`}>Voltar ao Portal</a>
        </div>
        <p className="mt-4 text-center text-xs text-secundario">Portal Importek · acesso restrito a colaboradores</p>
      </div>
    </div>
  );
}
