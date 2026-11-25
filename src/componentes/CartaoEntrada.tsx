/* eslint-disable react-refresh/only-export-components -- o cartão e os ajudantes dele andam juntos (a regra só afeta o recarregar do modo de desenvolvimento) */
// CARTÃO DE ENTRADA — o MESMO em todos os sistemas Importek (11/11/2026, pedido do Leo: "queria
// que o mesmo card idêntico aparecesse nessas duas telas"). Entre o clique no card do Portal e o
// sistema aberto passam DUAS telas: a do Portal (/abrir/<slug>) e esta (/entrar-portal, que troca
// o passe). As duas mostram ESTE cartão, com o nome do sistema.
//
// ⚠️ CÓPIA do original do Portal (portal-importek/src/componentes/CartaoEntrada.tsx); cópias
//    também na Proposta, no Dashboard Financeiro, no NPS, na Precificação, na Agenda e na Consulta de Produtos (19/11). Mudou lá →
//    muda aqui. Tudo é ESTILO EM LINHA com valores fixos (cores do Portal, fonte Nunito, logo de
//    32px) para sair igual ao pixel em todos, seja qual for a ferramenta de estilo do sistema.

const LOGO = `${import.meta.env.BASE_URL}logo-importek-cor.png`; // endereço único: o site mora em /biblioteca/
const FONTE = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&display=swap';
const GIRO = '@keyframes ipk-entrada-giro{to{transform:rotate(360deg)}}';

export function CartaoEntrada({ sistema, texto = 'Entrando no sistema…' }: { sistema?: string | null; texto?: string }) {
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', inset: 0, zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, boxSizing: 'border-box', background: '#fafaf5', fontFamily: 'Nunito, system-ui, "Segoe UI", sans-serif',
    }}>
      <link rel="stylesheet" href={FONTE} />
      <style>{GIRO}</style>
      <div style={{
        width: '100%', maxWidth: 420, boxSizing: 'border-box', background: '#ffffff', border: '1px solid #ecece2',
        borderRadius: 8, padding: '32px 24px', textAlign: 'center',
      }}>
        <img src={LOGO} alt="Importek" width={102} height={32} style={{ display: 'block', width: 102, height: 32, margin: '0 auto 24px' }} />
        <div aria-hidden="true" style={{
          width: 32, height: 32, boxSizing: 'border-box', margin: '0 auto 16px', border: '3px solid #ecece2',
          borderTopColor: '#23231f', borderRadius: '50%', animation: 'ipk-entrada-giro 0.8s linear infinite',
        }} />
        <p style={{ margin: '0 0 4px', minHeight: 28, fontSize: 20, lineHeight: '28px', fontWeight: 700, color: '#23231f' }}>
          {sistema || ' '}
        </p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 400, color: '#66665d' }}>{texto}</p>
      </div>
    </div>
  );
}

// O nome do sistema como o Portal o chama: vem no fragmento do passe (`#…&sistema=<nome>`).
// Ler ANTES de tirar o passe da barra (useState com função). Sem ele, o nome de sempre.
export function nomeDoSistema(padrao: string): string {
  try {
    const n = new URLSearchParams(window.location.hash.slice(1)).get('sistema');
    return n && n.length <= 80 ? n : padrao;
  } catch { return padrao; }
}

// "Acabou de entrar pelo Portal": depois de trocar o passe, o sistema ainda carrega (confere a
// sessão, recarrega a página). Nesses segundos, as esperas do sistema mostram ESTE cartão em vez
// da rodinha de sempre — senão aparece uma 3ª tela. Vale 15 s, só nesta aba.
const CHAVE_ENTRADA = 'ipk:entrada-portal';
export function marcarEntrada(sistema: string) {
  try { sessionStorage.setItem(CHAVE_ENTRADA, JSON.stringify({ sistema, em: Date.now() })); } catch { /* sem armazenamento */ }
}
export function entradaRecente(): string | null {
  try {
    const e = JSON.parse(sessionStorage.getItem(CHAVE_ENTRADA) || 'null');
    return e && Date.now() - e.em < 15_000 && typeof e.sistema === 'string' ? e.sistema : null;
  } catch { return null; }
}
