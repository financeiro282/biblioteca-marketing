# Registro da equipe — Biblioteca de Marketing

> **Leia antes de começar; escreva ao terminar.** As regras estão no `CLAUDE.md` da pasta
> `Projetos de IA`. Mais novo em cima. Nada de senha, chave ou conteúdo de `.env` aqui.

## EM USO AGORA

livre

<!-- Formato: Nome — desde AAAA-MM-DD HH:MM — o que vai fazer -->

## Histórico

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
- **A vez do Lucas:** criar o repositório vazio no GitHub (se ainda não criou), ligar o projeto da Vercel a ele
  (Settings → Git), fazer o push e anotar o endereço que a Vercel der. Depois, o `vercel.json` do Portal
  (`docs/PASSO-A-PASSO.md`, 4b.3).

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
