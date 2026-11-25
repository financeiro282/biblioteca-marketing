// Direito de uso de imagem — por evento e por arquivo. Regra (decisão do Lucas, 24/11/2026): vale o MAIS
// RESTRITIVO entre o evento e o arquivo. Ex.: arquivo "Uso liberado" num evento "Sem autorização" = sem autorização.
//
// A MESMA regra está no banco (políticas do RLS em importek-sistemas/banco/biblioteca/01-estrutura.sql): é o banco
// que garante; este arquivo serve à tela (o que mostrar), à API (o que oferecer) e ao modo demonstração.

export const DIREITOS = [
  { codigo: 'liberado', rotulo: 'Uso liberado', tom: 'sucesso', nivel: 1 },
  { codigo: 'interno', rotulo: 'Somente uso interno', tom: 'alerta', nivel: 2 },
  { codigo: 'sem_autorizacao', rotulo: 'Sem autorização', tom: 'erro', nivel: 3 },
];
export const CODIGOS_DIREITO = DIREITOS.map((d) => d.codigo);
const POR_CODIGO = Object.fromEntries(DIREITOS.map((d) => [d.codigo, d]));

/** Direito desconhecido conta como o mais restritivo (nunca libera por engano). */
const nivel = (d) => POR_CODIGO[d]?.nivel ?? 3;

/** O direito que vale: o mais restritivo dos dois. */
export function direitoEfetivo(doEvento, doArquivo) {
  const n = Math.max(nivel(doEvento), nivel(doArquivo));
  return DIREITOS.find((d) => d.nivel === n).codigo;
}

/** Colaborador só vê "liberado" e "interno"; Marketing e Administrador veem tudo. */
export const perfilVeDireito = (perfil, direito) =>
  perfil === 'marketing' || perfil === 'admin' || (perfil === 'colaborador' && nivel(direito) <= 2);

/** Link externo (agência, imprensa): só "Uso liberado". */
export const podeCompartilharExternamente = (direito) => direito === 'liberado';

export const rotuloDoDireito = (d) => POR_CODIGO[d]?.rotulo ?? 'Sem autorização';
export const tomDoDireito = (d) => POR_CODIGO[d]?.tom ?? 'erro';

/** Os direitos que o perfil pode escolher no filtro. */
export const direitosDoPerfil = (perfil) => DIREITOS.filter((d) => perfilVeDireito(perfil, d.codigo));
