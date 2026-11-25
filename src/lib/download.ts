// Download, zip e link externo no navegador (Fase 4). As regras ficam em compartilhado/download.js (as mesmas do
// servidor e da demonstração); aqui só os tipos do que a API devolve e o "começar o download".
import { api } from "../api";

export {
  LIMITES_LINK, VALIDADES_LINK, LIMITE_ARQUIVO_NO_ZIP, VALIDADE_ZIP_DIAS, formatoDoCodigo,
} from "../../compartilhado/download.js";

export type SituacaoZip = "na_fila" | "gerando" | "pronto" | "expirado" | "falhou";
export type ArquivoFora = { id: string; nome_original: string; tamanho_bytes: number };
export type ParteZip = { n: number; situacao: "na_fila" | "gerando" | "pronto" | "falhou"; bytes: number; arquivos: number };
export type Zip = {
  id: string; titulo: string; situacao: SituacaoZip; erro: string | null;
  criado_em: string; pronto_em: string | null; expira_em: string | null;
  total_arquivos: number; total_bytes: number; partes: ParteZip[]; fora: ArquivoFora[];
};
export type PedidoDeZip = { zip: Zip | null; fora: ArquivoFora[] };

export type LinkExterno = {
  id: string; titulo: string; destinatario: string | null; mensagem: string | null;
  expira_em: string; revogado_em: string | null; revogado_por_nome: string | null;
  criado_em: string; criado_por_nome: string; acessos: number; downloads: number; ultimo_acesso_em: string | null;
  com_senha: boolean; arquivos: number; situacao: "ativo" | "expirado" | "revogado";
};

/**
 * Começa o download: o link assinado do R2 já vem com o nome do arquivo (Content-Disposition: attachment),
 * então o navegador baixa e a página fica onde está.
 */
export function iniciarDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** O original de um arquivo (todos os perfis, só o que a pessoa vê). */
export async function baixarOriginal(id: string) {
  const r = await api<{ url: string }>(`arquivos?baixar=${encodeURIComponent(id)}`);
  iniciarDownload(r.url);
}

/** Uma parte pronta de um zip. */
export async function baixarZip(id: string, parte: number) {
  const r = await api<{ url: string }>(`zips?baixar=${encodeURIComponent(id)}&parte=${parte}`);
  iniciarDownload(r.url);
}

export const pedirZip = (corpo: { evento_id: string } | { ids: string[] }) =>
  api<PedidoDeZip>("zips", "POST", { acao: "pedir", ...corpo });

/** Endereço completo (a demonstração devolve só o caminho). */
export const enderecoCompleto = (e: string) => new URL(e, window.location.origin).toString();

/** dd/mm/aaaa HH:MM no horário de Brasília. */
export function quando(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}
