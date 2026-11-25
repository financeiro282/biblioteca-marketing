# Registro da equipe — Biblioteca de Marketing

> **Leia antes de começar; escreva ao terminar.** As regras estão no `CLAUDE.md` da pasta
> `Projetos de IA`. Mais novo em cima. Nada de senha, chave ou conteúdo de `.env` aqui.

## EM USO AGORA

Lucas Cerda — desde 2026-11-25 11:37 — Fase 5 publicada; aguarda o SQL 03 (se ainda não rodou) e o teste no ar

<!-- Formato: Nome — desde AAAA-MM-DD HH:MM — o que vai fazer -->

## Histórico

### 2026-11-25 — Lucas (com Claude) — FASE 5 (lixeira, painel de uso e log) — PUBLICADA (commit e push)
- **Pedido do Lucas:** "sim, pode fazer" (commits pendentes e seguir para a Fase 5); depois "pode fazer o commit e push".
- **Depende de:**
  - SQL 03 revisado pelo Leo e rodado pelo Lucas, com backup. Até ele rodar, só as partes novas falham
    (apagar de vez, crescimento por mês, medição e a lixeira vencida da rotina das 8h, que registra o erro e segue);
    o resto do sistema não muda.
  - Passo a passo: `docs/PASSO-A-PASSO.md`, "Fase 5".
- **Banco (`importek-sistemas/banco/biblioteca/03-lixeira-e-uso.sql` + `03-desfazer.sql`):** só acrescenta 6 funções.
  - Apagar de vez: só o Administrador, e só o que está na lixeira.
  - Rotina: só o que está na lixeira há 30 dias ou mais (mínimo 30, conferido no banco).
  - Uso do dia, alertas (uma vez por limite) e crescimento por mês.
  - PGlite **311/311** (+42).
- **Servidor (9 de 12 funções):**
  - `api/controle.js`: lixeira, uso, log com CSV e configuração;
  - `api/_rotina.js`: a rotina diária do cron das 8h. Faz os zips parados, a lixeira vencida (R2 primeiro, banco depois), o uso (soma real do bucket) e o aviso aos Administradores pelo Portal quando passa um limite;
  - "Medir agora" para o Administrador.
- **Telas:**
  - Lixeira (Administrador): restaurar; apagar de vez com "Entendo que não dá para desfazer"; prazo "apaga em N dias".
  - Painel de uso (Marketing e Administrador): espaço real, custo, arquivos, lixeira, conferência, por mês e maiores eventos; "Alertas e preços" para o Administrador.
  - Log (Administrador): filtros e CSV com BOM, ";" e proteção contra fórmula.
  - A página "Em breve" saiu: todas as telas do menu existem.
- **Demonstração:** 3 arquivos de exemplo na lixeira, uso calculado dos dados fictícios e um log fictício de 140 ações.
- **Testes:**
  - `npm test` **47/47**; `test:build` ok (de novo antes do push).
  - Edge (CDP):
    - lixeira: restaurar, e apagar de vez com confirmação;
    - painel: configuração salva;
    - log: filtro e CSV;
    - Marketing sem os botões de configuração e fora da lixeira;
    - 390 px sem rolagem nas 3 telas; console sem erro.

### 2026-11-25 — Lucas (com Claude) — FASE 4 (download, zip e links externos) — publicada (Lucas: "pode fazer o commit e push")
- **Pedido do Lucas:** "segue pra fase 4".
- **Depende de (nesta ordem):**
  - SQL 02 — **FEITO em 25/11/2026**: revisado pelo Leo, rodado pelo Lucas, conferência 8/8 ok, fotografia e checagem iguais;
  - regra `zips/` em 7 dias no Cloudflare — **FEITO em 25/11/2026** (Lucas);
  - depois, o commit e o push.
  - Passo a passo: `docs/PASSO-A-PASSO.md`, "Fase 4".
- **Banco (`importek-sistemas/banco/biblioteca/02-download-e-links.sql` + `02-desfazer.sql`):** só acrescenta.
  - 4 colunas e 8 funções. A rotina do zip roda sem sessão. O link externo é aberto pelo código. A senha é conferida no banco: 5 erros → 15 min.
  - O direito de uso é conferido de novo no zip e a cada acesso ao link.
  - PGlite **269/269** (188 + 81).
  - Os arquivos do `importek-sistemas` (01 e 02, LEIA-ME, teste) **ainda não têm commit** naquele repositório.
- **Servidor (8 de 12 funções):**
  - `arquivos?baixar` (original com o nome que veio, 1 h);
  - `api/zips.js` + `_zipador.js` + `_zip.js`:
    - zip "guardado", sem ZIP64, em partes de até 2 GB; arquivo acima de 1 GB fica fora e baixa direto;
    - 3 rotinas em paralelo, retomada pela página e pelo cron diário;
    - aviso pelo Portal (`/api/notificar`); a velocidade vai para o log da Vercel;
  - `api/links.js` (criar/revogar, endereço só uma vez) e `api/externo.js` (página pública), `_senha.js` (scrypt).
  - Dependência nova: `@vercel/functions` (`waitUntil`), justificada no PLANO, **para o Lucas confirmar**.
- **Telas:**
  - **Ficha:** "Baixar original" e "Link externo".
  - **Evento:**
    - "Baixar todos (zip)".
    - "Selecionar" agora vale para **todos os perfis**. Barra: Baixar (zip) para todos; Editar e Link externo para o Marketing; Lixeira para quem pode excluir.
  - **Meus downloads:** atualiza a cada 4 s enquanto prepara.
  - **Links externos:** acessos, downloads e revogar.
  - **Página pública `/biblioteca/l#código`:** sem login, senha, prévia, Baixar por arquivo e "Baixar todos" (um de cada vez).
- **Testes:**
  - `npm test` **40/40**. O zip é aberto pelo `tar` do Windows no teste, e o `Expand-Archive` foi provado à parte: nomes com acento, repetidos e pastas por evento.
  - `test:build` ok.
  - Edge (CDP), no modo demonstração:
    - zip pedido → pronto → baixado e aberto (25 arquivos);
    - original baixado com o nome certo;
    - link com senha (errada: "Restam 4"; certa: abre); "Baixar todos" público;
    - Colaborador só com "Baixar (zip)" e fora de /links;
    - 390 px sem rolagem; console sem erro.
  - Corrigido no caminho: dois botões principais na janela "Link criado"; faltava a etiqueta "Vídeo" na página pública.
- **No ar (25/11):** o 1º pedido de zip deu 500: "more than one relationship was found for arquivos and eventos" (a capa do evento é a 2ª ligação). Corrigido: o evento vem numa consulta à parte (`api/zips.js`). A demonstração não pega esse tipo de erro: só o banco de verdade.
- **Zip no ar (25/11, 15:26):** deu certo (Lucas). Velocidade medida: 108 MB em 5,5 a 7,1 s (16 a 20 MB/s), então uma parte de 2 GB leva ~2 min, dentro dos 5 min da função. Sem erro depois da correção. Link externo testado no ar pelo Lucas ("deu td certo"): criar com senha, senha errada, abrir, baixar todos, revogar. Logs sem erro depois da correção do zip. **Fase 4 completa no ar.**
- **Fica para depois:** zip pela página do link externo (se o Marketing pedir); apagar os zips de link vencido (Fase 5).

### 2026-11-25 — Lucas (com Claude) — FASE 3 (organização dos arquivos) — publicada (Lucas: "pode fazer o commit e push")
- **Pedido do Lucas:** "fase 3 agora, deu certo tudo" (os testes do envio de verdade deram certo).
- **O que mudou (sem SQL novo; continua 5 de 12 funções):**
  - `compartilhado/arquivo.js`: edição (legenda, autor, tags, direito), lote (até 500; só o que for pedido; tags
    +/−), `podeAprovar` (nunca "Sem autorização").
  - `api/arquivos.js` POST: `favoritar` (todos os perfis, cada um os seus), `alterar` (com `versao`), `lote`
    (cada linha com a sua versão; as alteradas no meio voltam como conflito), `capa`, `lixeira` (função do banco
    `arquivos_para_lixeira`). `api/eventos.js` POST `lixeira` (função `evento_para_lixeira`). Logs
    `arquivo.alterar`, `arquivo.alterar_lote`, `evento.capa` (a lixeira grava o log no próprio banco).
  - **Regra:** ficou "Sem autorização" (somando o evento)? A aprovação cai junto — no editar e no lote.
  - Tela: ficha do arquivo com Favoritar, Editar (janela), Aprovar/Tirar aprovação, Usar como capa, Mandar para a
    lixeira; página do evento com **Selecionar** (barra embaixo: Editar em lote, Lixeira, selecionar os da tela);
    "Editar evento" com a seção "Mandar o evento para a lixeira" (com confirmação).
  - Demonstração com as mesmas regras.
- **Testes:** `npm test` 28/28; `test:build` ok. Fotos do Edge (CDP): favoritar, aprovar, editar (aviso de que a
  aprovação cai), seleção (3), lote (+tags, aprovar: 1 recusado por "Sem autorização"), lixeira (30 → 28), seção da
  lixeira do evento, Colaborador só com "Favoritar" e sem "Selecionar", 390 px sem rolagem, console sem erro.
  - Corrigido no caminho: a etiqueta "Selecionar" saía preta sem texto (conflito de cores); "1 não foi aprovado: está".
- **Restaurar da lixeira:** Fase 5 (Administrador).
- **No ar (25/11, 13:58):** o Lucas testou pelo card ("deu certo"). Registros da Vercel da última hora: nenhum erro,
  nenhum 5xx; 2 ações em arquivos gravadas (POST 200; o registro não diz quais). Faltam as outras do roteiro.

### 2026-11-25 — Lucas (com Claude) — FASE 2 (envio) pronta no modo demonstração — NÃO publicada
- **O que mudou:**
  - `compartilhado/envio.js`: regras do envio (um PUT até 32 MB; acima, partes de 16 MiB iguais, até 10.000; limite
    de 100 GB; chaves no R2; leitura do pedido de início, dos dados e das partes).
  - `api/_r2.js`: links assinados (aws4fetch), estáveis em janelas de 10 min para ver (o navegador reaproveita a
    imagem), 15 min para enviar; envio em partes (criar, listar partes, juntar, abortar) e tamanho do objeto.
  - `api/envio.js` (5ª função de 12): iniciar (duplicado pelo SHA-256 → 409 com o nome do evento; retomada do
    mesmo arquivo "enviando" com as partes que já chegaram), assinar, concluir (confere no R2 que o arquivo chegou
    INTEIRO antes de marcar "pronto"; log `arquivo.enviar`, com `toca_no_navegador` nos vídeos), cancelar.
  - `src/envio/`: SHA-256 (nativo até 128 MB; acima, Worker com @noble/hashes), prévias (miniatura 320 px e foto
    2048 px; HEIC por heic-to; RAW pela prévia embutida; vídeo: quadro de ~1 s, duração, data do "mvhd"), fila
    (3 arquivos, 3 partes, novas tentativas, espera a internet voltar, link vencido → pede outro).
  - `src/paginas/Enviar.tsx`: escolher evento, direito dos arquivos, autor; arrastar arquivos **ou pastas**.
  - `eventos.js`/`arquivos.js`: links do R2 de verdade (assíncronos).
  - **Busca:** o "_" e o "." passaram a ficar no texto buscado ("IMG_9001.JPG" não achava nada antes).
  - Demonstração: `POST /envio` e um "R2" de mentira que só conta os bytes (arquivo com "queda" no nome falha
    uma vez, para ver a retomada).
- **Sem SQL novo.** Bibliotecas aprovadas: `aws4fetch`, `@noble/hashes`, `exifr`, `heic-to` (no navegador, só na tela
  de envio; o heic-to, 3,2 MB, só quando aparece HEIC).
- **Testes:** `npm test` 25/25 (regras, assinatura e XML do R2, API sem cookie, envio na demonstração com partes,
  retomada e duplicado); `test:build` ok. Fotos do Edge (CDP), envio de verdade na demonstração: foto JPG (medidas e
  miniatura), "vídeo" de 40 MB em 3 partes com queda simulada (retomou sozinho), .txt recusado, cópia com outro
  nome → "já está no evento", arquivo aparece no evento, 390 px sem rolagem, console sem erro.
- **⚠️ Achado:** pelo endereço do Portal vale SÓ o CSP do Portal (o da Biblioteca é substituído). O passo 4c
  (`docs/PASSO-A-PASSO.md`) ganhou `media-src blob:` (capa de vídeo) e a decisão do HEIC (`worker-src blob:`).
- **Cloudflare (Lucas, 25/11):** conta criada; bucket **`importek-biblioteca`** (o nome definitivo, mantido: o R2
  não renomeia; os arquivos de teste ficam nele e são apagados antes da liberação); CORS só para o Portal; token só
  deste bucket; `R2_CONTA`, `R2_CHAVE_ID`, `R2_CHAVE_SEGREDO`, `R2_BUCKET` na Vercel (Sensitive). Conta
  `a973894994bed38bc82769a05155f14d`.
- **CSP:** HEIC liberado pelo Lucas ("a, pode liberar"). Portal e Biblioteca com a conta R2 em img/media/connect e
  `worker-src 'self' blob:` (teste do Portal 42 ok).
- **Publicado (25/11, 12:30):** Biblioteca `cb0b111` e Portal `955c704` (CSP com o R2 conferido no ar; Portal,
  Precificação, Consulta, Prospects e Fluxo abrindo).
- **1º envio de verdade (Lucas, 25/11):** evento de teste criado pelo card e fotos enviadas: "deu certo". Logs: 15
  `POST /envio`, nenhum erro.
- **Falta:** o teste grande (300 fotos + vídeo de vários GB, com a conexão derrubada no meio) e os eventos/arquivos
  de teste a apagar antes da liberação (estão no bucket definitivo).

### 2026-11-25 — Lucas (com Claude) — CRIAR E EDITAR EVENTO (adiantado da Fase 3)
- **Decisões do Lucas (25/11, "pode sim"):** criar/editar evento antes do envio (o envio precisa de um evento);
  bibliotecas da Fase 2 aprovadas (`aws4fetch`, `@noble/hashes`, `exifr`, `heic-to`; justificativa no `docs/PLANO.md`).
- **O que mudou:**
  - `compartilhado/evento.js`: a regra dos campos (a mesma na tela, na API e na demonstração), com os limites do
    banco. Direito de uso **sem padrão** (escolhido sempre); tags sem repetição (ignora acento e maiúscula).
  - `api/eventos.js`: `POST { acao: 'criar' | 'alterar' }` (continua 4 de 12 funções). Permissão `organizar` aqui e
    no banco (políticas `eventos_incluir`/`eventos_alterar`). Alterar confere a `versao`: se outra pessoa salvou
    antes, nada é gravado (409). Log `evento.criar` / `evento.alterar` (só os nomes dos campos; na troca de direito,
    o antes e o depois). `GET ?id=` passou a trazer a `versao`.
  - `src/paginas/EventoFormulario.tsx` (`/evento/novo` e `/evento/:id/editar`). Aviso antes de salvar quando o
    direito fica mais aberto (ex.: "Sem autorização" → o Colaborador passa a ver).
  - Demonstração: `POST /eventos` (fica na memória do `npm run dev`).
- **SQL:** nenhum (a estrutura de 24/11 já permitia).
- **Testes:** `npm test` 21/21 (regra dos campos, API sem cookie/sem JSON, demonstração criando e alterando, 409);
  `test:build` ok. Fotos do Edge (CDP): avisos nos campos, criar → abre o evento, editar com aviso de direito,
  Colaborador sem acesso ao formulário, 390 px e 1366 px sem rolagem lateral, console sem erro.
- **Não testado ainda:** gravar no banco de verdade (só pelo card, depois da publicação).

### 2026-11-25 — Lucas (com Claude) — GIT: primeiro commit (repositório `financeiro282/biblioteca-marketing`)
- **Decisão do Lucas:** publicar como os outros sistemas: repositório próprio no GitHub (`financeiro282`), com a
  Vercel ligada e publicando a cada push no `main`. Também é onde vai rodar a cópia diária R2 → B2 (Fase 6).
- **O que entrou:** o projeto inteiro (Fase 1 + menu do Dash), com o `package-lock.json` novo (gerado da cópia local
  já testada, sem instalar nada novo; a Vercel instala as mesmas versões). Arquivos adicionados por nome.
- **Conferido antes:** testes 17/17, `test:build` ok, varredura de segredos limpa (só as somas do `copia.json`),
  nenhum `.env*`, `.vercel`, chave ou mídia (o `.gitignore` barra). O `.env.local` do `vercel link` já foi apagado.
- **E-mail do commit:** `financeiro@importek.com.br`, com o nome do Lucas. O e-mail dele ainda não está na
  `financeiro282` (os commits de 24/11 na Consulta também saíram assim), e a Vercel recusaria a publicação.
- **Vercel:** variáveis prontas (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `BIBLIOTECA_DB_TOKEN`, `PORTAL_URL`,
  `PORTAL_SEGREDO`, `CRON_SECRET`). Faltam só as do R2 (Fase 2).
- **Commit `9f3983a`, push feito (25/11). Publicado e NO AR em https://biblioteca-marketing.vercel.app** (Vercel
  ligada ao repositório; publica a cada push no `main`). Conferido no ar: `/` → `/biblioteca/`; páginas 200; API sem
  sessão → 401 `sem_sessao`; `/api/portal` sem segredo → 401; nada da demonstração no JS; cabeçalhos de segurança;
  funções em São Paulo (`gru1`).
- **1ª entrada pelo card do Portal (25/11) deu "Algo deu errado no servidor".** Log da Vercel:
  `Invalid schema: biblioteca`. Faltava pôr `biblioteca` em Supabase → Project Settings → Data API → **Exposed
  schemas** (passo do LEIA-ME depois do SQL). O Lucas salvou, e a entrada seguinte funcionou (sessão criada,
  eventos e arquivos consultados, sem erro; a lista vem vazia porque o banco ainda não tem eventos).
  - Por enquanto o card entra direto por `biblioteca-marketing.vercel.app`, e não pelo endereço do Portal.
- **Correção:** no ar, o `logo-circulo.png` do menu recolhido voltava como página (`text/html`), porque o
  `vercel.json` lista um a um os arquivos de `public/` e ele ficou fora. Entrou na lista, e o teste novo em
  `testes/servidor.test.mjs` confere que todo arquivo de `public/` está nela (18/18).
- **Portal:** `vercel.json` com os desvios de `/biblioteca` e teste `testa-endereco-unico.mjs` 36 ok (ver o
  REGISTRO do Portal). Falta o push. Depois, trocar o endereço de entrada do card para
  `https://portal-importek.vercel.app/biblioteca/` (4b.6).

### 2026-11-25 — Lucas (com Claude) — menu lateral no padrão do Dash — pronto, NÃO publicado, sem git
- **Pedido do Lucas:** viu as telas no modo demonstração ("seria isso mesmo") e pediu: "o layout, vamos seguir o
  exemplo do P:\Dash".
- **O que mudou:**
  - `src/componentes/Layout.tsx`: o menu do Dash (que veio do Proposta em 23/11). No computador, barra recolhida de
    64 px com ícones de traço fino, que abre por cima (240 px) ao passar o mouse ou pelo Tab. Títulos dos grupos
    em caixa alta ("Geral", "Marketing", "Administração"). Rodapé com nome e perfil (o e-mail saiu, como no Dash);
    recolhida, mostra as iniciais. Esc fecha o menu do celular. Contorno do foco por dentro do item.
  - `public/logo-circulo.png`: o círculo da Importek da barra recolhida (cópia transparente do Dash).
  - `CLAUDE.md` (seção Visual): a regra do menu.
- **O que não mudou:** cores, fonte, telas, rotas, permissões e o menu do celular. As cores e a fonte já eram as do
  Dash (o padrão v1 veio da identidade dele). O Dash tem tema escuro; a biblioteca segue sem (o padrão não tem).
- **Testes:** `npm test` 17/17; `npm run test:build` ok (tipos, build, nada da demonstração no dist). Fotos do Edge
  sem janela, controlado por CDP para simular o mouse: barra 64 px recolhida e 240 px aberta, recuo do conteúdo
  sempre 64 px, Tab abre, 1024 e 1023 px, celular de 390 px, Esc fecha; sem rolagem lateral em nenhuma largura.
- **Armadilha:** foto do menu aberto não sai com o `--screenshot` simples do Edge (precisa do mouse em cima). Usar
  o Edge com `--remote-debugging-port` e `Input.dispatchMouseEvent` (o Node 24 já tem WebSocket).
- **Vercel (25/11, conferido pelo `vercel env ls`, só nomes):** projeto `biblioteca-marketing` criado e ligado
  (`.vercel/project.json`), `PORTAL_URL` e `PORTAL_SEGREDO` gravados pelo `ligar-app.mjs`, SQL do hash rodado
  (Lucas). Nenhuma publicação ainda. `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` gravados pelo Lucas.
  - **`BIBLIOTECA_DB_TOKEN` gravado (25/11) pelo Lucas, com a chave dos sistemas que o Leo passou (kid `24c984cb…`).
    VENCE EM 23/02/2027.** Antes disso: rodar de novo o `gerar-token-sistema.mjs` e publicar.
  - ⚠️ A chave chegou ao Lucas numa pasta da REDE (`P:\passwords`, criada em 25/11 às 10:52). Foi copiada para
    `C:\Users\User\chaves\` (fora da rede), e a pasta da rede foi apagada. O Leo decide se troca a chave e se a cópia
    fica no computador do Lucas. Na raiz do `P:\` também há `github-recovery-codes.txt` e `railway-recovery-codes.txt`
    (avisado ao Lucas).
  - ⚠️ O `vercel link` deixou `.env.local` (só `VERCEL_OIDC_TOKEN`) na pasta de rede: apagar.
- **Banco:** o Lucas informou (25/11) que **já rodou o SQL** no Supabase do Portal. O
  `LEIA-ME.md` de `importek-sistemas/banco/biblioteca/` ainda diz "NÃO RODADO": atualizar na próxima vez que
  alguém mexer no `importek-sistemas`.
- **Passo a passo do Portal detalhado** em `docs/PASSO-A-PASSO.md` (4a card, 4b entrada, 4c CSP).
  - ⚠️ **Armadilha:** o "Novo sistema" do Portal não tem campo de código e gera o slug pelo nome
    (`biblioteca-de-marketing`). A saída é criar como "Biblioteca" e renomear depois.
  - ⚠️ O código do perfil Administrador sai `administrador` sozinho: tem de ser `admin`.
- **Pendente / a vez de quem:** Lucas: card no Portal (4a), conta Cloudflare, projeto na Vercel. Leo: plano da
  Vercel (os termos do Hobby, seção 4, só permitem uso pessoal ou não comercial; o Pro custa US$ 20/mês por
  assento, com US$ 20 de crédito de uso) e o código do Portal (4b.3, 4c). Decidir o git da biblioteca.

### 2026-11-24 — Lucas (com Claude) — PROJETO NOVO + FASE 1 (base) — pronto, NÃO publicado, sem git
- **Pedido do Lucas:** sistema novo do Portal para o Marketing guardar fotos e vídeos de eventos; colaboradores consultam e baixam.
- **Decisões do Lucas (24/11):**
  - arquitetura aprovada: R2 privado + cópia no B2 com Object Lock + metadados no banco do Portal + endereço `/biblioteca`;
  - direito de uso: **vale o mais restritivo** (evento × arquivo);
  - cópia diária pelo **GitHub Actions**;
  - acervo atual: **78 GB no Drive**;
  - o **Leo confirma** que revisa o SQL e mexe no Portal.
  - Plano, custos com as fontes e fases: `docs/PLANO.md`.
- **O que foi feito:**
  - projeto inteiro: `api/` (sessao, portal, eventos, arquivos; 4 de 12 funções), `compartilhado/`, `src/` (Eventos, Evento, Buscar/Favoritos/Aprovadas, ficha do arquivo; telas das próximas fases marcadas com a fase), `demo/`, `testes/`, `docs/`;
  - padrão visual v1.0.0 (padrao-visual), copiado pelo script do Portal.
  - SQL no `importek-sistemas` (ver o REGISTRO de lá).
- **Desenho que muda em relação aos outros sistemas:**
  - O RLS depende da SESSÃO: o servidor manda o cookie no cabeçalho `x-biblioteca-sessao`, com um cliente do banco por pedido. Sem sessão, nada é lido.
  - A busca é feita por funções do banco.
  - A lixeira passa só por funções.
- **Testes:**
  - `npm test` 17/17;
  - `npm run test:build` ok (nenhum vestígio da demonstração no dist);
  - banco PGlite 188/188;
  - telas conferidas com fotos do Edge headless: Marketing, Colaborador, ficha e celular de 390 px.
- **Armadilhas:**
  - **Lixeira:** o Postgres recusa o UPDATE de lixeira quando a política de leitura esconde a linha de quem altera ("new row violates row-level security policy"). Por isso a lixeira é feita por funções.
  - **Captura do celular:** o Edge headless não abre janela com menos de 500 px. Para o celular, use um iframe de 390 px.
  - **esbuild:** o npm 11 avisa que o esbuild tem "install scripts" não aprovados; o build funcionou assim.
- **Pendente / próximos passos:**
  - Lucas olhar as telas no modo demonstração (`docs/PASSO-A-PASSO.md`, seção "Agora");
  - Leo revisar o SQL (`importek-sistemas/banco/biblioteca/`);
  - Fase 2 (envio): Lucas cria a conta Cloudflare e o bucket de teste;
  - decidir com o Lucas: git e repositório (ainda não há), e o projeto na Vercel.

<!-- MODELO DE ENTRADA (copie para o topo do histórico):
### AAAA-MM-DD — Nome — título curto
- **O que mudou:** … (commits `abc1234`)
- **Por quê / decisão do usuário:** …
- **Armadilhas:** …
- **Ficou pendente / a vez de quem:** …
-->
