# Biblioteca de Marketing — arquitetura, custos e plano (aprovado em 24/11/2026)

Pedido do Lucas (24/11/2026): sistema do Portal onde o Marketing guarda e organiza fotos e vídeos dos eventos e os
colaboradores consultam e baixam. Volume esperado acima de 1 TB, com muitos vídeos. Acervo atual: **78 GB** no Drive.

## Decisões do Lucas (24/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Arquitetura | **OK**: R2 (principal) + cópia no B2 + metadados no banco do Portal + endereço `portal…/biblioteca/` |
| 2 | Direito de uso | **Vale o mais restritivo** entre o evento e o arquivo |
| 3 | Onde roda a cópia diária | **GitHub Actions** (rclone, nuvem para nuvem) |
| 4 | Acervo atual | No Drive, **78 GB**. A carga será pelo próprio sistema (uma pasta por evento), na Fase 6 |
| 5 | Leo | **Confirma** que revisa o SQL e faz as mudanças no Portal |
| 6 | Ordem (25/11) | **Criar e editar evento primeiro** (era da Fase 3): o envio precisa de um evento. Capa, lixeira e o resto da organização seguem na Fase 3 |
| 7 | Bibliotecas novas (25/11) | **Aprovadas:** `aws4fetch`, `@noble/hashes`, `exifr` e `heic-to` (justificativa abaixo, em "Bibliotecas") |
| 8 | Menu (25/11) | **O do Dash:** barra recolhida com ícones no computador |

## Bibliotecas novas (aprovadas pelo Lucas em 25/11/2026)

| Biblioteca | Onde | Para quê | Por que não à mão |
|---|---|---|---|
| `aws4fetch` (MIT, 64 KB) | servidor | assinar os links do R2 (envio em partes, miniaturas, download) | é a dos exemplos da Cloudflare; o SDK da AWS faz o mesmo com um tamanho muitas vezes maior |
| `@noble/hashes` (MIT) | navegador | SHA-256 de arquivo grande em pedaços (duplicados) | o navegador só calcula com o arquivo inteiro na memória (vídeo de 4 GB travaria). É JavaScript puro: não precisa mudar o CSP |
| `exifr` (MIT) | navegador | data de captura, câmera, orientação (JPG, HEIC, RAW) | ler EXIF à mão é muito código e frágil |
| `heic-to` (LGPL-3.0) | navegador, só quando aparece HEIC | HEIC → JPG (prévia) | Chrome e Edge no Windows não abrem HEIC. Uso interno, sem modificar a biblioteca |
| `@vercel/functions` (Apache-2.0, da própria Vercel) — **Fase 4, 25/11, para o Lucas confirmar** | servidor | `waitUntil`: o zip continua sendo montado depois de responder "pedido recebido" | é o jeito documentado da Vercel; sem ele, a função é congelada ao responder. Fazer à mão seria depender de um detalhe interno da Vercel |

- As do navegador carregam só na tela de envio (o Colaborador nunca baixa).
- ⚠️ O `heic-to` usa WebAssembly, e o CSP do Portal (`script-src 'self'`) não permite. Se o teste confirmar, o
  Lucas decide: (a) liberar só o WebAssembly (`'wasm-unsafe-eval'`) no CSP do Portal, com o Leo; ou (b) HEIC
  sem prévia, como o RAW.

## Fase 4: como ficou (25/11/2026, proposta do Claude para o Lucas confirmar)

| Ponto | Como ficou | Por quê |
|---|---|---|
| Baixar o original | link assinado do R2 com o nome original, 1 h para começar (todos os perfis, só o que a pessoa vê; vai para o log) | o arquivo vai direto do R2 ao navegador, sem passar pela Vercel |
| Zip | montado **no servidor**, em segundo plano, lendo do R2 e gravando no R2; **partes de até 2 GB** ("parte 1 de N"); aviso pelo Portal; fica **7 dias** | cada parte cabe numa função da Vercel (5 min) e abre em qualquer programa (sem ZIP64); a pessoa pode fechar a página |
| Arquivo acima de 1 GB | **não entra no zip**: baixa direto (aparece na lista do zip com "Baixar") | vídeo grande já é um arquivo só; dentro do zip só atrasaria |
| Zips ao mesmo tempo | no máximo 3 sendo preparados por pessoa | evita pedido repetido sem querer |
| Link externo | validade de 1 a 90 dias (padrão 7), senha opcional, revogar; o endereço aparece **uma vez** (o banco guarda só o sha256 do código) | quem tem o banco não tem os links |
| Página do link | sem login; miniaturas, prévia, "Baixar" por arquivo e "Baixar todos" (um de cada vez) — **sem zip** | o visitante não dispara trabalho no servidor; zip para link pode vir depois, se o Marketing pedir |
| Senha do link | o banco guarda só o scrypt; o servidor manda só a "prova"; **o banco compara e conta**: 5 erros → 15 min bloqueado | um erro no código do servidor não abre link com senha |
| Direito no link | só "liberado" no arquivo **e** no evento, conferido na criação **e a cada acesso** | mudou o direito ou foi para a lixeira → some do link na hora |

- **A medir no ar:** a velocidade do zip (o log da Vercel mostra MB/s por parte). Se 2 GB não couberem com folga em 5 min, diminuir a parte.

## Arquitetura

```
Navegador ──(1) pede links assinados────▶ api/ (Vercel, São Paulo) ──confere sessão e perfil──▶ banco do Portal
     │                                                                               (área biblioteca, RLS pela sessão)
     └──(2) envia as partes direto───────▶ Cloudflare R2 (bucket PRIVADO)
                                                    │
                                    (3) cópia diária (rclone, GitHub Actions)
                                                    ▼
                                    Backblaze B2 (Object Lock 30 dias)
```

- **Arquivos:** no R2, num bucket privado, em `originais/<ano>/<id>.<ext>` (nunca o nome que veio do usuário).
  - O original é guardado como veio.
  - Miniatura (320 px) e foto grande (2048 px) são JPG gerados no navegador de quem envia e ficam em `miniaturas/` e `previas/`.
  - Nenhum link público permanente: só links assinados de poucos minutos.
- **Metadados:** no Supabase do Portal, área `biblioteca`, papel `app_biblioteca`.
  - O RLS depende da **sessão da pessoa**: sem sessão válida, nenhuma linha é lida.
  - Detalhes em `importek-sistemas/banco/biblioteca/LEIA-ME.md`.
- **Telas e servidor:** na Vercel, um projeto só deste sistema, aberto pelo endereço único do Portal (`/biblioteca`).
- **Login:** só pelo Portal (contrato em `portal-importek/docs/CONTRATO-DOS-SISTEMAS.md`).

## Custos (preços das páginas oficiais, consultados em 24/11/2026; US$/mês, 1 TB = 1000 GB)

| Item | 78 GB (hoje) | 1 TB | 5 TB |
|---|---|---|---|
| R2 Standard, principal (US$ 0,015/GB; 10 GB grátis; download grátis) | 1,02 | 14,85 | 74,85 |
| B2, cópia (US$ 6,95/TB; 10 GB grátis; download grátis até 3× o guardado) | 0,47 | 6,88 | 34,68 |
| Supabase (metadados: alguns MB no Pro do Portal, já pago) | 0 | 0 | 0 |
| Vercel (Hobby atual) / GitHub Actions | 0 | 0 | 0 |
| **Total** | **≈ 1,49** | **≈ 21,73** | **≈ 109,53** |

- **Não inclui** impostos nem o IOF do cartão.
- **Operações do R2** (US$ 4,50 por milhão de escritas e US$ 0,36 por milhão de leituras; 1 milhão e 10 milhões grátis por mês): ficam dentro da cota grátis no uso previsto.
- **Comparação feita:**

| Serviço | 1 TB | 5 TB | Observação |
|---|---|---|---|
| Supabase Storage | 19 a 24 | 134 a 217 | 100 GB incluídos e divididos com o Portal; o teto de gastos para em 100 GB |
| Wasabi | 7,99 | 39,95 | mínimo de 1 TB e 90 dias por arquivo |
| AWS S3 São Paulo | 71 | 415 | download US$ 0,15/GB |

- **Prévia de vídeo:** decisão do Lucas **depois da medição da Fase 2**.

| Opção | Custo |
|---|---|
| A) Sem prévia | 0 |
| B) Cloudflare Stream | US$ 5 por 1.000 min guardados + US$ 1 por 1.000 min assistidos |
| C) ffmpeg próprio | cerca de US$ 0,015 por GB de prévia |

  Media Transformations está descartado: aceita vídeo de no máximo 100 MB e 10 min.
- **Fontes:**
  - developers.cloudflare.com/r2/pricing (30/10/2026) e /r2/platform/limits
  - backblaze.com/cloud-storage/pricing
  - supabase.com/pricing
  - developers.cloudflare.com/stream/pricing
  - vercel.com/docs/functions/limitations

## Cópia de segurança

- **Destino:** bucket B2 com **Object Lock de 30 dias** e versionamento.
- **Como:** rclone diário no **GitHub Actions**, de nuvem para nuvem (não usa a internet do escritório).
- **Arquivo apagado de vez no R2:** fica oculto no B2 por mais 30 dias. Somando com a lixeira, são 30 + 30 dias.
- **Chaves com poder mínimo:** R2 só de leitura para a cópia; no B2, chave sem permissão de apagar versões.
- **Teste de restauração:** no roteiro e a cada 3 meses.

## Plano em fases

| Fase | Entrega | Situação |
|---|---|---|
| 1. Base | entrada pelo Portal, 3 perfis, layout padrão, modo demonstração, SQL + RLS provados no Postgres local | **feita em 24/11** |
| 2. Envio | arrastar e soltar, envio em partes direto ao R2, retomada, duplicados, miniaturas, HEIC, capa de vídeo, data de captura | **feita e no ar em 25/11** (falta o teste grande: 300 fotos + vídeo de GB com queda) |
| 3. Organização | criar/editar eventos, tags, direito de uso, favoritos, "Aprovadas", lixeira (mandar) | **feita em 25/11** (eventos no ar; arquivos: demonstração) |
| 4. Download e links | original, zip em segundo plano com aviso pelo Portal, links externos com validade/senha/revogação | **feita em 25/11 no modo demonstração**; no ar depois do SQL 02 e da regra `zips/` no Cloudflare (PASSO-A-PASSO, Fase 4) |
| 5. Controle | lixeira (ver/restaurar/apagar de vez em 30 dias), painel de uso, alertas, log e relatórios | a fazer |
| 6. Produção | bucket definitivo + cópia no B2, endereço e CSP no Portal, roteiro completo, restauração, carga dos 78 GB, liberação | a fazer |

## Limites que pesam

- **Vercel Hobby:**
  - No máximo 12 funções por projeto. A biblioteca usa 8 (25/11) e deve chegar a cerca de 10.
  - Tarefa agendada só uma vez por dia; função com no máximo 300 s; requisição de no máximo 4,5 MB. Por isso o arquivo vai direto do navegador ao R2.
  - Os termos da Vercel (seção 4) limitam o Hobby a uso não comercial. Isso vale para todos os sistemas da empresa; a decisão é do Leo.
- **Riscos registrados:**
  - O original leva os metadados da câmera, inclusive o GPS, também nos links externos.
  - O RLS protege contra erro no código, não contra o token do servidor vazado. Nesse caso: `revoke app_biblioteca from authenticator`.
