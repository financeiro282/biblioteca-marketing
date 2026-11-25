// Links do Cloudflare R2 (bucket PRIVADO) — miniatura, prévia e original.
//
// FASE 1: ainda não há R2. As funções devolvem null e a tela mostra um quadro neutro no lugar da imagem.
// FASE 2 (envio): links assinados (S3 SigV4) de poucos minutos, gerados AQUI no servidor com as chaves do R2 em
// variáveis de ambiente (R2_CONTA, R2_CHAVE_ID, R2_CHAVE_SEGREDO, R2_BUCKET) — nunca no navegador. Nenhum link
// público permanente: sem domínio público e sem r2.dev.
//
// Por que null em vez de um endereço falso: uma imagem quebrada na tela parece defeito; o quadro neutro deixa
// claro que ainda não há prévia.

/** Link assinado da miniatura (320 px). FASE 1: sem R2 → null. */
export function linkDaMiniatura(chave) {
  return chave ? null : null;
}

/** Link assinado da prévia (foto grande ou vídeo de prévia). FASE 1: sem R2 → null. */
export function linkDaPrevia(chave) {
  return chave ? null : null;
}
