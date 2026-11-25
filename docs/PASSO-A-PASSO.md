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

Os passos detalhados vêm com a Fase 2. O que será preciso:

1. **Cloudflare (Lucas):**
   - criar a conta e ativar o R2 (pede cartão);
   - criar o bucket **privado** `importek-biblioteca-teste`, sem domínio público e sem r2.dev;
   - configurar o CORS só para o endereço do Portal, com `ETag` exposto;
   - criar um token do R2 **só para esse bucket** (leitura e escrita).
   - O Claude manda o JSON do CORS e a lista de cliques.
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

### 4c. CSP do Portal (junto com a publicação da Fase 2; precisa do ID da conta Cloudflare)

O CSP do Portal também vale para as páginas da biblioteca, porque elas abrem no endereço dele. Sem esta mudança,
as miniaturas, o vídeo e o envio para o R2 são bloqueados pelo navegador. Em `P:\portal-importek\vercel.json`,
no valor do `Content-Security-Policy`, trocar `<ID>` pelo ID da conta Cloudflare (fica no painel do R2):

- **Antes:** `img-src 'self' data: blob: https://dsdvolzjuxibhppvhjzf.supabase.co; connect-src 'self' https://dsdvolzjuxibhppvhjzf.supabase.co wss://dsdvolzjuxibhppvhjzf.supabase.co;`
- **Depois:** `img-src 'self' data: blob: https://dsdvolzjuxibhppvhjzf.supabase.co https://<ID>.r2.cloudflarestorage.com; media-src 'self' blob: https://<ID>.r2.cloudflarestorage.com; connect-src 'self' https://dsdvolzjuxibhppvhjzf.supabase.co wss://dsdvolzjuxibhppvhjzf.supabase.co https://<ID>.r2.cloudflarestorage.com;`

Só o endereço da conta, nunca `*.r2.cloudflarestorage.com` (isso liberaria o bucket de qualquer pessoa). O código
da biblioteca usa links no formato `https://<ID>.r2.cloudflarestorage.com/<bucket>/…`. Se a Fase 2 precisar de
mais alguma coisa no CSP, isso vem escrito aqui antes da publicação.

## Fase 6: produção e cópia de segurança

1. **Cloudflare:** bucket definitivo `importek-biblioteca`.
   - Regra de ciclo de vida: abortar envio incompleto em 7 dias e apagar `zips/` em 7 dias.
   - Alerta de cobrança da conta.
2. **Backblaze (Lucas):**
   - criar a conta e o bucket `importek-biblioteca-copia` com **Object Lock** ligado na criação (retenção padrão de 30 dias);
   - regra de ciclo de vida para apagar versão oculta em 30 dias;
   - chave **sem** `deleteFiles`, só para esse bucket.
3. **GitHub:** repositório do sistema com o workflow diário do rclone.
   - Segredos no GitHub: chave do R2 **só leitura** e chave do B2.
   - O Claude prepara o workflow e a lista de cliques.
4. **Portal:** trocar o status para **Produção** e liberar para todos.
