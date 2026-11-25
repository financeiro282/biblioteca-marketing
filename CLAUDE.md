# Biblioteca de Marketing — regras do projeto

Vale também o `CLAUDE.md` da pasta de cima (`Projetos de IA`): leia-o antes. Leia o `REGISTRO.md` (EM USO) e
`docs/PLANO.md` (decisões do Lucas). Responsável: Lucas. Modelo de código: `importacao-importek` e `prospects-importek`.

## Regras do Lucas (24/11/2026)
- **Não criar contas** nem configurar Cloudflare, Supabase, Vercel ou o Portal: preparar e dar o passo a passo exato
  (`docs/PASSO-A-PASSO.md`).
- **Chaves só em variáveis de ambiente**, nunca no navegador nem na pasta.
- **Sem dependência nova sem justificar** (no `docs/PLANO.md` ou no REGISTRO).
- **Sem deploy, git commit ou push** sem o Lucas pedir.
- Responsivo em desktop, notebook (1366×768) e celular, sem rolagem horizontal.

## Banco = o do PORTAL (modelo da unificação)
- **Área e papel:** `biblioteca` e `app_biblioteca`. O token é `BIBLIOTECA_DB_TOKEN`. **Nunca** a service role, nem em teste.
- **SQL:** fica em `importek-sistemas/banco/biblioteca/`, numerado.
  - Todo SQL: comentário inicial, roda duas vezes, termina com conferência e tem um desfazer.
  - **Nada roda sem o Leo revisar.** Quem roda é o Lucas, com backup.
- **RLS pela SESSÃO:** o servidor manda o valor do cookie no cabeçalho `x-biblioteca-sessao` (cliente do banco **por pedido**, `clienteDoBanco(token)`).
  - Sem sessão, nada é lido.
  - Tabela nova: RLS + políticas que dependem da sessão + REVOKE de anon/authenticated/PUBLIC.
  - Função nova: `revoke execute ... from public, anon, authenticated`.
  - E o teste PGlite (`importek-sistemas/scripts/testa-banco-biblioteca.mjs`) tem de passar.
- **Lixeira:** só pelas funções `*_para_lixeira` / `*_restaurar`. O UPDATE comum é recusado pelo Postgres, porque a linha some da leitura de quem altera.
- **Funções SEM sessão (SQL 02, Fase 4):** a rotina do zip (`zip_*`) e o link externo (`link_abrir`, `link_baixar`).
  Elas conferem TUDO por dentro (direito de cada arquivo, validade, senha). Regra nova de quem vê o quê → muda
  também nelas, e o teste PGlite (seções 10c e 10d) tem de passar.
- **Apagar de vez (SQL 03, Fase 5):** SEMPRE o R2 primeiro (`apagarDoR2`) e só depois o banco, com os ids cujos
  objetos todos saíram. A rotina diária só apaga o que está na lixeira há 30 dias ou mais (o banco confere).
- **Regra que existe em dois lugares:** quem vê o quê está nas políticas do banco **e** em `compartilhado/visibilidade.js` (só para a demonstração e a tela). Mudou num, muda no outro.

## Arquivos (R2)
- **Bucket PRIVADO:** sem domínio público, sem r2.dev; só links assinados de poucos minutos, gerados no servidor (`api/_r2.js`).
- **Envio:** do navegador direto ao R2, em partes (link assinado por parte). O arquivo **nunca** passa pela Vercel (limite de 4,5 MB).
- **Chaves no R2:** `originais/<ano>/<id>.<ext>`, `miniaturas/…`, `previas/…`, `zips/…`. Nunca o nome do usuário.
- **Original:** sempre preservado, sem compressão.
- **Zips (Fase 4):** `zips/<id>/parte-<n>.zip`, montados pelo servidor (`api/_zipador.js`), partes de até 2 GB,
  apagados pelo próprio R2 em 7 dias (regra do bucket). Arquivo acima de 1 GB não entra no zip.
- **Link externo (Fase 4):** o código vai **só no `#` do endereço** (`/biblioteca/l#código`). Nunca em parâmetro
  de URL, log ou banco (lá, só o sha256). A senha nunca vai ao banco nem ao log: só o hash scrypt e a "prova"
  (`api/_senha.js`). A página `/l` fica FORA da parte protegida do app (sem sessão, sem menu).

## Endereço único
- **Onde mora:** o site em `/biblioteca/` (Vite `base`, `BrowserRouter basename`) e a API em `/biblioteca/api` (o cookie só vai para ela).
- **Portal:** o `vercel.json` do Portal repassa `/biblioteca*`. **Pelo endereço do Portal vale SÓ o CSP do Portal**
  (o da Biblioteca é substituído): ele libera a conta R2 da Biblioteca (img, media, connect) e `worker-src blob:`
  (HEIC), desde 25/11/2026. Mudou algo que o navegador busca fora? Muda o CSP do Portal **e** o daqui.

## Modo demonstração
- **Onde vale:** só no `npm run dev` (`demo/`, carregado com `import()` só no "serve"). **Nada da demonstração em `src/`.**
- **O que não faz:** não lê variável de ambiente nem conecta a banco, R2 ou Portal. Os dados são 100% fictícios (e-mail `.invalid`, nomes "(exemplo)").
- **Prova:** `npm run test:build` (nenhum vestígio no `dist/`). Rodar antes de todo push.
- **A cada tela nova:** rota em `ROTAS` (`demo/plugin-demo.mjs`) + dados em `demo/dados-demo.mjs` + um caso em `testes/demo.test.mjs`.

## Visual
- **Padrão:** cópia v1.0.0 em `padrao-visual/`. Não editar (`node padrao-visual/conferir.mjs`).
- **Menu lateral = o do Dash** (Lucas, 25/11/2026), em `src/componentes/Layout.tsx`. É a única diferença em relação
  ao padrão v1, que pede barra fixa de 240 px só com texto.
  - Computador (≥ 1024 px): recolhido em 64 px, só com ícones de traço fino; abre por cima (240 px) ao passar o mouse
    ou pelo Tab; o conteúdo fica sempre com recuo de 64 px. Ícones desenhados no próprio arquivo (sem biblioteca).
  - Celular (< 1024 px): o menu de sempre ("Menu", abre por cima). Toda classe da barra recolhida leva `lg:`.
  - Item novo no menu: precisa de rótulo **e** ícone. Medidas e cores: LEIA-ME de
    `P:\Dash\SISTEMA\backups\proposta-menu-padrao-20261119`.
- **Texto e formatos:** sem emoji, texto curto e neutro, data dd/mm/aaaa, uma ação principal por tela.
- **Depois de mudar uma tela:** renderizar e OLHAR (foto com o Edge em modo headless). O Edge não abre janela com menos de 500 px: para o celular, use uma página com `<iframe width="390">`.
