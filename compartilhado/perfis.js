// Perfis de acesso — o MESMO catálogo para a API (api/_comum.js confere em toda rota que grava), para as telas
// (src/ decide o que aparece) e para o banco (CHECK de biblioteca.sessoes.perfil e as políticas do RLS, em
// importek-sistemas/banco/biblioteca/01-estrutura.sql). O código de cada perfil tem de ser IGUAL ao cadastrado no
// Portal (Gerenciar sistemas → Biblioteca de Marketing → Perfis de acesso), digitado à mão.
//
// Pedido do Lucas (24/11/2026):
//   colaborador → vê e baixa o que for "Uso liberado" ou "Somente uso interno"
//   marketing   → envia, organiza, edita, exclui (lixeira), compartilha externamente, vê o painel de uso
//   admin       → tudo, incluindo a lixeira (ver e restaurar), os relatórios (log) e a configuração
//
// ⚠️ ORDEM: `colaborador` PRIMEIRO. Ao liberar um sistema para alguém, o Portal entra com o PRIMEIRO perfil
//    da lista — assim, quem for liberado sem escolher fica com o menor acesso.
// Perfil novo: aqui → CHECK de biblioteca.sessoes.perfil e políticas (SQL novo) → Portal, nesta ordem.

/** @typedef {'baixar' | 'enviar' | 'organizar' | 'excluir' | 'compartilhar' | 'ver_uso' | 'lixeira' | 'relatorios' | 'configurar'} Permissao */

/** @type {{ codigo: string, rotulo: string, permissoes: Permissao[] }[]} */
export const PERFIS = [
  { codigo: 'colaborador', rotulo: 'Colaborador', permissoes: ['baixar'] },
  { codigo: 'marketing', rotulo: 'Marketing', permissoes: ['baixar', 'enviar', 'organizar', 'excluir', 'compartilhar', 'ver_uso'] },
  { codigo: 'admin', rotulo: 'Administrador', permissoes: ['baixar', 'enviar', 'organizar', 'excluir', 'compartilhar', 'ver_uso', 'lixeira', 'relatorios', 'configurar'] },
];

export const CODIGOS = PERFIS.map((p) => p.codigo);
const POR_CODIGO = Object.fromEntries(PERFIS.map((p) => [p.codigo, p]));

/** O perfil tem a permissão? Perfil desconhecido não tem nenhuma. */
export const pode = (perfil, permissao) => !!POR_CODIGO[perfil]?.permissoes.includes(permissao);

/** Nome do perfil para a tela. */
export const rotuloDoPerfil = (perfil) => POR_CODIGO[perfil]?.rotulo ?? 'Colaborador';
