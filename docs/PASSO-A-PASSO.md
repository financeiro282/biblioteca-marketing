# Passo a passo de configuração

**Regra (Lucas, 24/11/2026):** o Claude não cria contas nem configura Cloudflare, Supabase, Vercel ou o Portal.
Ele prepara, e quem executa é o Lucas (e o Leo, no banco e no Portal). Chaves só em variáveis de ambiente,
nunca no navegador nem nesta pasta. Nunca `vercel env pull` na pasta de rede.

## Agora (Fase 1): ver as telas no modo demonstração

Não precisa de conta nenhuma. Os dados são fictícios e não há banco, R2 nem Portal.

1. **PowerShell, só na 1ª vez e sempre que a pasta de rede mudar.** Copia o projeto para uma pasta local, porque o `npm` não roda na pasta de rede:
   ```powershell
   robocopy "P:\biblioteca-marketing" "C:\Projetos\biblioteca-local" /MIR /XD node_modules .git dist .vercel /XF ".env*"
   cd C:\Projetos\biblioteca-local
   npm install
   ```
   O `npm` avisa que o esbuild tem "install scripts". Pode ignorar: os testes e o build passaram assim.
2. Para abrir: `npm run dev` e, no navegador, **http://localhost:5174/biblioteca/**.
3. A faixa vermelha no topo troca o perfil (Colaborador, Marketing, Administrador). O mesmo evento mostra coisas diferentes para cada um.
4. Para parar: **Ctrl+C** no terminal. Se perguntar "Deseja finalizar o arquivo em lotes (S/N)?", responda **S**.
5. ⚠️ A pasta `C:\Projetos\biblioteca-local` é só um espelho. Não edite nada lá: a próxima atualização apaga.

## Fase 2: armazenamento de teste e primeira publicação

1. **Cloudflare (Lucas).** Os nomes dos menus podem variar um pouco; o que importa está em negrito.
   1. **Conta:** em `dash.cloudflare.com`, criar a conta (sugestão: um e-mail da empresa que não dependa de uma
      pessoa só) e confirmar o e-mail. Ligar a verificação em duas etapas (Profile → Authentication).
   2. **Ativar o R2:** menu **R2 Object Storage** → ativar o plano. Pede cartão; a cobrança só começa acima de
      10 GB guardados por mês (o teste fica dentro disso).
   3. **Alerta de cobrança:** Billing → **Billing notifications** → aviso a partir de US$ 5.
   4. **Bucket:** R2 → **Create bucket**
      - nome: **`importek-biblioteca`** (criado assim em 25/11/2026 e mantido: é o definitivo; o R2 não renomeia
        bucket). Os arquivos dos testes ficam nele e são apagados antes da liberação (Fase 6);
      - Location: **Automatic**; Default storage class: **Standard** → Create.
   5. **Fechado ao público:** no bucket → **Settings**
      - **Public Development URL (r2.dev): Disabled** (já vem assim; conferir);
      - **Custom Domains:** nenhum;
      - **Object lifecycle rules:** conferir que existe a regra de **abortar envios em partes incompletos em
        7 dias** (o R2 cria por padrão). Se não existir, criar.
   6. **CORS:** no bucket → Settings → **CORS Policy** → Add / Edit → colar exatamente isto → Save:
      ```json
      [
        {
          "AllowedOrigins": ["https://portal-importek.vercel.app"],
          "AllowedMethods": ["GET", "PUT", "HEAD"],
          "AllowedHeaders": ["content-type"],
          "ExposeHeaders": ["ETag"],
          "MaxAgeSeconds": 3600
        }
      ]
      ```
      Só o endereço do Portal: nenhum outro site consegue enviar para o bucket pelo navegador. O `ETag` exposto é o
      que permite juntar as partes de um vídeo grande no fim do envio.
   7. **Token só deste bucket:** R2 → **Manage API tokens** → **Create API token**
      - Permissions: **Object Read & Write**;
      - Specify bucket(s): **só `importek-biblioteca`**;
      - TTL: Forever → Create.
      - A tela mostra **uma vez só** o Access Key ID, o Secret Access Key e o endereço
        `https://<ID da conta>.r2.cloudflarestorage.com`. Não fechar antes do passo 8.
   8. **Vercel** → `biblioteca-marketing` → Settings → Environment Variables (só Production, **Sensitive**):
      - `R2_CONTA` = o ID da conta (o trecho antes de `.r2.cloudflarestorage.com`);
      - `R2_CHAVE_ID` = Access Key ID;
      - `R2_CHAVE_SEGREDO` = Secret Access Key;
      - `R2_BUCKET` = `importek-biblioteca`.
      - ⚠️ As chaves vão **só** para a Vercel: nunca no chat, em arquivo, no e-mail ou na pasta de rede.
   9. **Avisar o Claude do ID da conta** (não é segredo: ele aparece no endereço e entra no CSP do Portal, passo 4c).
2. **Vercel (Lucas):** projeto novo `biblioteca-marketing`, região São Paulo.
   - Variáveis, todas só em Production e marcadas como Sensitive:

| Variável | O que é |
|---|---|
| `SUPABASE_URL` | do Portal, só a origem |
| `SUPABASE_PUBLISHABLE_KEY` | chave pública do Portal |
| `BIBLIOTECA_DB_TOKEN` | Etapa 3, com o Leo |
| `PORTAL_URL`, `PORTAL_SEGREDO` | pelo `portal-importek/scripts/ligar-app.mjs biblioteca "<pasta>"` |
| `CRON_SECRET` | 16 caracteres ou mais |
| `R2_CONTA`, `R2_CHAVE_ID`, `R2_CHAVE_SEGREDO`, `R2_BUCKET` | as chaves do R2 |

3. **Banco (Lucas + Leo).** SQL rodado pelo Lucas em 25/11/2026 (roteiro em `importek-sistemas/banco/biblioteca/LEIA-ME.md`).
   - Conferir que `biblioteca` está em Supabase → Project Settings → Data API → **Exposed schemas**.
   - **Token (Leo):** só quem tem o arquivo da chave dos sistemas (fora da rede, com o Leo) gera o token. O script
     grava `BIBLIOTECA_DB_TOKEN` direto na Vercel, sem mostrar. Depois do `vercel link` da pasta, no PowerShell:
     ```powershell
     cd "\\servidor\Financeiro\Projetos de IA\importek-sistemas"
     node scripts\gerar-token-sistema.mjs --papel app_biblioteca --chave "<arquivo da chave>" --vercel "\\servidor\Financeiro\Projetos de IA\biblioteca-marketing" --dias 90
     ```
     No `--vercel`, use o mesmo caminho da pasta que funcionou no `ligar-app.mjs` daquele computador: no do Lucas é
     `P:\biblioteca-marketing`; no do Leo, a letra `Y:` falhou em 18/11 e ele usou `\\servidor\...`.
     - A chave nunca na rede nem dentro de um repositório git: o script recusa ("A chave não pode ficar numa pasta de
       rede"). No computador do Lucas, por exemplo: `C:\Users\User\chaves\`.
   - ⚠️ O `vercel link` cria um `.env.local` com `VERCEL_OIDC_TOKEN` na pasta: **apagar** logo depois.
   - **`SUPABASE_PUBLISHABLE_KEY`:** Supabase → projeto do Portal → Project Settings → **API Keys** → "Publishable
     key" (começa com `sb_publishable_`) → copiar. Vercel → `biblioteca-marketing` → Settings → Environment
     Variables → Add: nome `SUPABASE_PUBLISHABLE_KEY`, valor colado, só **Production** → Save.
4. **Portal.** São três partes, em momentos diferentes. As partes que mudam o **código** do Portal (4b.3 e 4c)
   publicam o Portal para todo mundo no push. Pelo combinado, quem faz é o Leo. Se for o Lucas, marcar o EM USO do
   `portal-importek` e avisar o Leo.

### 4a. Cadastrar o card (pode ser feito já)

Portal → Início → **Gerenciar sistemas** → **Novo sistema**.

⚠️ **O código do sistema.** A tela não tem campo para o código (slug): ela o gera a partir do nome, e "Biblioteca de
Marketing" viraria `biblioteca-de-marketing`. O sistema espera `biblioteca`. Por isso:
1. Criar com o nome **`Biblioteca`** (só essa palavra) e salvar.
2. Abrir de novo (**Editar**) e trocar o nome para **`Biblioteca de Marketing`**. Na edição, o código não muda.

| Seção | Campo | Valor |
|---|---|---|
| Card | Nome do sistema | ver acima |
| Card | Descrição | `Fotos e vídeos dos eventos` |
| Card | Ícone | o que preferir |
| Endereço | Endereço do sistema | `https://portal-importek.vercel.app/biblioteca/` |
| Endereço | Configuração técnica → Endereço de entrada | **vazio por enquanto** (preenchido no 4b) |
| Perfis de acesso | Adicionar perfil, 3 vezes, **nesta ordem** | `Colaborador` (código `colaborador`) · `Marketing` (código `marketing`) · `Administrador` (código **`admin`**) |
| Perfis de acesso | Responsável pelos acessos | a pessoa do Marketing: `Nome <email@importek.com.br>` |
| Exibição | Status | **Em desenvolvimento** |
| Exibição | Mostrar no Portal | **desmarcado** até o 4b |

- ⚠️ **Código do Administrador:** a tela preenche `administrador` sozinha. Trocar à mão para **`admin`** antes de
  salvar. Depois de salvo, o código não muda mais.
- O primeiro perfil é o **Padrão** (o que a pessoa recebe ao ser liberada): deixar o Colaborador em primeiro.

### 4b. Ligar a entrada pelo Portal (depois do projeto na Vercel, passo 2, publicado)

1. Ligar a pasta ao projeto: em `P:\biblioteca-marketing`, rodar `vercel link` e escolher o projeto
   `biblioteca-marketing` (cria a pasta `.vercel`, que não vai para o git). **Não** rodar `vercel env pull` aqui.
2. Na pasta do Portal: `node scripts/ligar-app.mjs biblioteca "P:\biblioteca-marketing"`.
   - Ele grava `PORTAL_SEGREDO` e `PORTAL_URL` na Vercel da biblioteca, sem mostrar a senha.
   - Ele imprime um SQL com o hash: rodar no SQL Editor do Supabase do Portal. Precisa do card do 4a já criado.
3. **Código do Portal** (`P:\portal-importek\vercel.json`): acrescentar os três desvios **antes** do último item de
   `rewrites` (`"/((?!api/).*)"` → `/index.html`), como os dos outros sistemas. Trocar o endereço se a Vercel tiver
   dado outro nome ao projeto (ver em Vercel → projeto → Domains):
   ```json
   { "source": "/biblioteca", "destination": "https://biblioteca-marketing.vercel.app/biblioteca/" },
   { "source": "/biblioteca/", "destination": "https://biblioteca-marketing.vercel.app/biblioteca/" },
   { "source": "/biblioteca/:caminho*", "destination": "https://biblioteca-marketing.vercel.app/biblioteca/:caminho*" },
   ```
   O teste do Portal `testes/testa-endereco-unico.mjs` ganha os mesmos casos dos outros sistemas. Commit e push.
4. Publicar a biblioteca de novo (para ela ler o `PORTAL_SEGREDO`).
5. Conferir no ar: `https://portal-importek.vercel.app/biblioteca/` mostra a Biblioteca (e não a tela do Portal).
6. Gerenciar sistemas → **Editar** Biblioteca de Marketing:
   - Configuração técnica → Endereço de entrada: `https://portal-importek.vercel.app/biblioteca/`;
   - marcar **Mostrar no Portal**;
   - liberar o acesso só para quem vai testar.

### 4c. CSP do Portal — FEITO em 25/11/2026 (conta `a973894994bed38bc82769a05155f14d`, HEIC liberado pelo Lucas)

⚠️ **Pelo endereço do Portal, vale SÓ o CSP do Portal** (conferido em 25/11/2026: o cabeçalho da Biblioteca é
substituído pelo do Portal). Sem esta mudança, o navegador bloqueia as miniaturas, o vídeo, a capa de vídeo
(gerada de um `blob:`) e o envio para o R2. Em `P:\portal-importek\vercel.json`, no valor do
`Content-Security-Policy`, trocar `<ID>` pelo ID da conta Cloudflare (fica no painel do R2):

- **Antes:** `img-src 'self' data: blob: https://dsdvolzjuxibhppvhjzf.supabase.co; connect-src 'self' https://dsdvolzjuxibhppvhjzf.supabase.co wss://dsdvolzjuxibhppvhjzf.supabase.co;`
- **Depois:** `img-src 'self' data: blob: https://dsdvolzjuxibhppvhjzf.supabase.co https://<ID>.r2.cloudflarestorage.com; media-src 'self' blob: https://<ID>.r2.cloudflarestorage.com; connect-src 'self' https://dsdvolzjuxibhppvhjzf.supabase.co wss://dsdvolzjuxibhppvhjzf.supabase.co https://<ID>.r2.cloudflarestorage.com;`
- **HEIC (decisão do Lucas, pendente):** o conversor (`heic-to`) roda num Worker criado de um `blob:`. Para ter
  prévia de HEIC, trocar também `worker-src 'self'` por `worker-src 'self' blob:`. Sem isso, o HEIC sobe normalmente
  (o original vai sempre), só que sem prévia, como o RAW. O `blob:` no worker só roda código que a própria página
  criou: não abre a porta para script de outro site.

Só o endereço da conta, nunca `*.r2.cloudflarestorage.com` (isso liberaria o bucket de qualquer pessoa). O código
da biblioteca usa links no formato `https://<ID>.r2.cloudflarestorage.com/<bucket>/…`. Se a Fase 2 precisar de
mais alguma coisa no CSP, isso vem escrito aqui antes da publicação.

## Fase 4: download, zip e links externos (25/11/2026)

O código está pronto e testado no modo demonstração. Para ir ao ar, falta um SQL novo e uma regra no Cloudflare.
**A ordem importa:** primeiro o SQL (passo 1), depois a publicação (passo 3). O SQL só acrescenta: o sistema que
está no ar hoje continua funcionando igual com ele.

### 1. SQL 02 no banco do Portal (Leo revisa, Lucas roda, com backup) — FEITO em 25/11/2026 (Leo revisou; Lucas rodou; conferência 8/8 ok; fotografia e checagem iguais)

Arquivos: `importek-sistemas/banco/biblioteca/02-download-e-links.sql` e `02-desfazer.sql`.
- **O que faz:** só acrescenta, só na área `biblioteca`, nenhuma tabela nova.
  - 4 colunas: título do zip; acessos, downloads e último acesso do link.
  - 8 funções: a rotina do zip, que roda sem a pessoa logada, e o link externo, aberto por quem não tem conta.
  - O banco confere de novo o direito de uso de cada arquivo, no zip e a cada acesso ao link. A senha do link é conferida pelo banco: 5 erros bloqueiam por 15 min.
- **Prova:** `scripts/testa-banco-biblioteca.mjs` (PGlite): **269/269** em 25/11/2026 (188 do 01 + 81 do 02).
- **Como rodar** (o mesmo roteiro do 01, no `LEIA-ME.md` do banco):
  1. Backup conferido. Rode a fotografia (`00-fotografia-portal.sql`) e a checagem e **salve as duas**.
  2. SQL Editor → colar o `02-download-e-links.sql` **inteiro** → Run.
     O fim mostra uma **conferência de 8 linhas, todas com `ok = true`**.
  3. Rode a fotografia e a checagem de novo: têm de sair **iguais às de antes**.
  4. Deu errado? `02-desfazer.sql` inteiro (conferência de 3 linhas `ok = true`).

### 2. Cloudflare: os zips se apagam sozinhos em 7 dias — FEITO em 25/11/2026 (regra `zips/` criada pelo Lucas)

R2 Object Storage → bucket `importek-biblioteca` → aba **Settings** → **Object Lifecycle Rules** → **Add rule**
(caminho da documentação da Cloudflare, `developers.cloudflare.com/r2/buckets/object-lifecycles`):
- **Nome:** `zips-7-dias`
- **Onde vale:** só o **prefixo** `zips/` (com a barra; **nunca** o bucket inteiro)
- **Ação:** a que apaga/expira os objetos, depois de **7 dias**. As outras ações (Infrequent Access, envio
  incompleto) ficam desmarcadas nesta regra.
- **Save changes.**

A documentação não dá o nome de cada campo do formulário: se a tela vier diferente, mande o que aparece.
Envio em partes não terminado: todo bucket já tem uma regra padrão que o descarta em 7 dias (não precisa criar).
O R2 apaga em até ~24 h depois do prazo; a tela "Meus downloads" já mostra o zip como vencido no 7º dia.

### 3. Publicar (o Claude faz o commit e o push quando o Lucas pedir)

- **Na Vercel, nada novo:** `CRON_SECRET`, `PORTAL_URL` e `PORTAL_SEGREDO` já existem.
- **Variáveis do sistema:** a rotina do zip chama o próprio endereço do projeto. Confira em Settings → Environment
  Variables que **"Automatically expose System Environment Variables"** está marcado. Vem marcado por padrão.
- **No Portal, nada novo:**
  - A página do link externo (`/biblioteca/l`) passa pelo mesmo desvio de `/biblioteca*`.
  - O CSP já libera as miniaturas do R2. O download é uma ida direta ao R2, que o CSP não bloqueia.
  - O aviso "zip pronto" usa o `/api/notificar` do Portal, que já existe (contrato, item 7).

### 4. Testar no ar (Lucas, pelo card)

1. Numa foto: **Baixar original**. O arquivo chega com o nome original.
2. No evento de teste: **Baixar todos (zip)**. Em alguns minutos chega o aviso no sininho do Portal. Em
   **Meus downloads**, baixe o zip e abra no Windows.
3. **Selecionar** 3 fotos → **Link externo** com senha → copiar o endereço → abrir numa **janela anônima**:
   - senha errada mostra "Restam 4 tentativas";
   - com a senha certa, aparecem as fotos e o "Baixar todos".
4. Em **Links externos**: **Revogar**. A janela anônima, recarregada, diz "cancelado".
5. O Claude confere os registros da Vercel. Lá ficam a velocidade do zip (MB/s) e qualquer erro.

## Fase 6: produção e cópia de segurança

1. **Cloudflare:** o bucket `importek-biblioteca` (já criado em 25/11/2026). **Antes de liberar: apagar os eventos e
   os arquivos de teste** (banco e R2).
   - Regras de ciclo de vida: já na Fase 4 (passo 2 acima). Conferir que continuam lá.
   - Alerta de cobrança da conta.
2. **Backblaze (Lucas):**
   - criar a conta e o bucket `importek-biblioteca-copia` com **Object Lock** ligado na criação (retenção padrão de 30 dias);
   - regra de ciclo de vida para apagar versão oculta em 30 dias;
   - chave **sem** `deleteFiles`, só para esse bucket.
3. **GitHub:** repositório do sistema com o workflow diário do rclone.
   - Segredos no GitHub: chave do R2 **só leitura** e chave do B2.
   - O Claude prepara o workflow e a lista de cliques.
4. **Portal:** trocar o status para **Produção** e liberar para todos.
