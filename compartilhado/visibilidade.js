// Quem vê o quê — a MESMA regra das políticas do RLS (importek-sistemas/banco/biblioteca/01-estrutura.sql).
//
// QUEM GARANTE É O BANCO: sem sessão nada é lido, e o Colaborador não recebe "Sem autorização" nem pela API.
// Este arquivo existe para o MODO DEMONSTRAÇÃO (que não tem banco) se comportar igual, e para os testes
// conferirem que a regra escrita aqui é a do banco. Mudou lá → muda aqui (e o teste do banco tem de passar).

import { perfilVeDireito } from './direito.js';

/** Evento visível: Administrador vê tudo; Marketing, fora da lixeira; Colaborador, fora da lixeira e liberado/interno. */
export function eventoVisivel(perfil, ev) {
  if (!ev) return false;
  if (perfil === 'admin') return true;
  if (perfil === 'marketing') return !ev.excluido_em;
  if (perfil === 'colaborador') return !ev.excluido_em && perfilVeDireito('colaborador', ev.direito_uso);
  return false;
}

/** Arquivo visível: o evento também tem de estar visível (vale o mais restritivo). */
export function arquivoVisivel(perfil, arq, ev) {
  if (!arq || !eventoVisivel(perfil, ev)) return false;
  if (perfil === 'admin') return true;
  if (perfil === 'marketing') return !arq.excluido_em;
  if (perfil === 'colaborador') return !arq.excluido_em && arq.situacao === 'pronto' && perfilVeDireito('colaborador', arq.direito_uso);
  return false;
}

/** Nas telas de consulta (fora da lixeira e do envio), mesmo quem pode ver mais só vê o que está pronto e fora da lixeira. */
export const paraConsulta = (arq, ev) => !arq.excluido_em && arq.situacao === 'pronto' && !ev?.excluido_em;
