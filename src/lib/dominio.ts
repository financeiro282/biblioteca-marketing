// Tipos do que a API devolve e as regras compartilhadas (compartilhado/, as MESMAS do servidor e da demonstração).

export { PERFIS, pode, rotuloDoPerfil } from "../../compartilhado/perfis.js";
import { tomDoDireito as tomJs } from "../../compartilhado/direito.js";
export {
  DIREITOS, direitoEfetivo, direitosDoPerfil, podeCompartilharExternamente, rotuloDoDireito,
} from "../../compartilhado/direito.js";

/** Tom da bolinha de situação para o direito de uso (tipado para o componente Status). */
export const tomDoDireito = (d: string) => tomJs(d) as "sucesso" | "alerta" | "erro";
export { TIPOS, duracaoLegivel, rotuloDoTipo, tamanhoLegivel, FORMATOS } from "../../compartilhado/formatos.js";
export { POR_PAGINA } from "../../compartilhado/busca.js";

export type Perfil = "colaborador" | "marketing" | "admin";
export type Direito = "liberado" | "interno" | "sem_autorizacao";
export type Tipo = "foto" | "video" | "raw";
export type Permissao = "baixar" | "enviar" | "organizar" | "excluir" | "compartilhar" | "ver_uso" | "lixeira" | "relatorios" | "configurar";

export type Eu = { email: string; nome: string; perfil: Perfil };

export type Evento = {
  id: string;
  nome: string;
  data_evento: string;          // aaaa-mm-dd
  local: string | null;
  descricao: string | null;
  tags: string[];
  responsavel: string | null;
  direito_uso: Direito;
  capa_url: string | null;
  total_arquivos: number;
  total_bytes: number;
  fotos: number;
  videos: number;
  raws: number;
  versao?: number;              // só no evento pedido pelo id (para o "Editar evento")
};

export { LIMITES, direitoFicouMaisAberto, lerEvento, lerTags } from "../../compartilhado/evento.js";

export type Arquivo = {
  id: string;
  evento_id: string;
  evento_nome: string;
  evento_data: string;
  tipo: Tipo;
  nome_original: string;
  extensao: string;
  tamanho_bytes: number;
  largura: number | null;
  altura: number | null;
  duracao_seg: number | null;
  capturado_em: string | null;
  camera: string | null;
  autor: string | null;
  legenda: string | null;
  tags: string[];
  direito_arquivo: Direito;
  direito_evento: Direito;
  direito_efetivo: Direito;
  aprovada: boolean;
  favorito: boolean;
  miniatura_url: string | null;
  previa_url: string | null;
};

export type PaginaDeArquivos = { arquivos: Arquivo[]; total: number; pagina: number; por_pagina: number };

/** dd/mm/aaaa de uma data aaaa-mm-dd (sem fuso: é a data do evento como foi cadastrada). */
export function dataCurta(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** dd/mm/aaaa HH:MM no horário de Brasília (data de captura). */
export function dataHoraBrasil(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

/** "12 fotos · 3 vídeos · 2 RAW" (só o que tem). */
export function resumoDoEvento(e: Pick<Evento, "fotos" | "videos" | "raws">) {
  const partes = [];
  if (e.fotos) partes.push(`${e.fotos} ${e.fotos === 1 ? "foto" : "fotos"}`);
  if (e.videos) partes.push(`${e.videos} ${e.videos === 1 ? "vídeo" : "vídeos"}`);
  if (e.raws) partes.push(`${e.raws} RAW`);
  return partes.length ? partes.join(" · ") : "Nenhum arquivo";
}
