// Fase 5: tipos do que a API de controle devolve. Regras em compartilhado/controle.js.
export {
  ACOES_DO_LOG, DIAS_LIXEIRA, custoMensal, diasParaApagar, lerLimites, rotuloDaAcao,
} from "../../compartilhado/controle.js";

export type EventoNaLixeira = {
  id: string; nome: string; data_evento: string; excluido_em: string; excluido_por_nome: string | null;
  apaga_em: string; arquivos: number; bytes: number;
};
export type ArquivoNaLixeira = {
  id: string; evento_id: string; evento_nome: string; tipo: "foto" | "video" | "raw"; nome_original: string; extensao: string;
  tamanho_bytes: number; excluido_em: string; excluido_por_nome: string | null; apaga_em: string; miniatura_url: string | null;
};
export type Configuracao = {
  limites_alerta_gb: number[]; preco_principal_gb: number; gratis_principal_gb: number; preco_copia_gb: number; gratis_copia_gb: number;
  atualizado_em: string | null; atualizado_por_nome: string | null;
};
export type Painel = {
  hoje: null | {
    dia: string; bytes_banco: number; arquivos_banco: number; bytes_lixeira: number; bytes_r2: number | null; objetos_r2: number | null;
    por_tipo: Record<string, number>; registrado_em: string;
  };
  historico: { dia: string; bytes: number }[];
  por_mes: { mes: string; arquivos: number; bytes: number }[];
  maiores: { id: string; nome: string; data_evento: string; arquivos: number; bytes: number }[];
  alertas: { limite_gb: number; avisado_em: string }[];
  config: Configuracao | null;
  custo: { principal: number; copia: number; total: number } | null;
  pode_configurar: boolean;
};
export type LinhaDoLog = {
  id: number; em: string; email: string | null; nome: string | null; perfil: string | null; acao: string;
  alvo_tipo: string | null; alvo_id: string | null; detalhes: Record<string, unknown> | null; ip: string | null;
};

export const dolar = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;
