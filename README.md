# Biblioteca de Marketing

Fotos e vídeos dos eventos da Importek. O Marketing envia, organiza e compartilha; os colaboradores consultam e
baixam. Acesso **só pelo Portal Importek** (login único), no endereço `portal-importek…/biblioteca/`.

Plano, custos e decisões: `docs/PLANO.md`. Configuração: `docs/PASSO-A-PASSO.md`. Testes: `docs/ROTEIRO-DE-TESTE.md`.
**Situação (24/11/2026):** Fase 1 feita. Roda só no modo demonstração: ainda sem banco, R2 ou publicação.

## Perfis (catálogo do Portal, nesta ordem)

| Código | Rótulo | Pode |
|---|---|---|
| `colaborador` | Colaborador | ver e baixar o que for "Uso liberado" ou "Somente uso interno" |
| `marketing` | Marketing | + enviar, organizar, editar, excluir (lixeira), compartilhar externamente, painel de uso |
| `admin` | Administrador | + lixeira (ver e restaurar), relatórios (log), configuração |

**Direito de uso** por evento e por arquivo: "Uso liberado", "Somente uso interno" ou "Sem autorização".
- Vale o **mais restritivo** dos dois.
- O link externo só aceita "Uso liberado".

## Peças

| Onde | O que |
|---|---|
| `api/_comum.js` | sessão (cookie httpOnly em `/biblioteca/api`), cliente do banco **por pedido** com o cabeçalho da sessão, token do papel, assinatura do Portal |
| `api/sessao.js` | quem está aqui · entrar (troca do passe) · sair |
| `api/portal.js` | avisos do Portal (`portal-evento`) e conferência de acessos (`sincronizar-portal` e o cron diário) |
| `api/eventos.js` · `api/arquivos.js` | consulta com busca e filtros (funções `buscar_eventos` e `buscar_arquivos` do banco, com o RLS de quem chama); criar e editar evento |
| `api/envio.js` | envio (Fase 2): iniciar, assinar partes, concluir (confere o tamanho no R2), cancelar. O arquivo vai do navegador direto ao R2 |
| `api/_r2.js` | links assinados do R2 (aws4fetch), o envio em partes e o download com o nome original; sem `R2_*` configurado, devolve vazio |
| `api/zips.js` · `api/_zipador.js` · `api/_zip.js` | zip em segundo plano (Fase 4): pedir, "Meus downloads", a rotina que monta o zip (R2 → R2, partes de até 2 GB) e o aviso pelo Portal |
| `api/controle.js` · `api/_rotina.js` | Fase 5: lixeira (restaurar; apagar de vez: R2 primeiro, banco depois), painel de uso (soma real do R2 + banco, custo), log (filtros e CSV), configuração; a rotina diária (zips, lixeira vencida, uso e alertas) |
| `api/links.js` · `api/externo.js` · `api/_senha.js` | link externo (Fase 4): o Marketing cria e revoga; a página pública (`/biblioteca/l#código`, sem login) abre e baixa; senha pelo scrypt, conferida no banco |
| `src/envio/` | a fila de envio no navegador: SHA-256 (duplicados), prévias e dados (EXIF, vídeo), partes, retomada |
| `compartilhado/` | regras usadas pela tela, pela API e pela demonstração: perfis, direito, formatos, busca, visibilidade, download/zip/link |
| `demo/` | modo demonstração (só no `npm run dev`; nunca vai para a Vercel) |
| `src/` | telas (React + Vite + Tailwind, padrão visual v1.0.0 do Portal em `padrao-visual/`, cópia que não se edita) |
| banco | `importek-sistemas/banco/biblioteca/` (área `biblioteca`, papel `app_biblioteca`, RLS pela sessão) |

- **O navegador nunca fala com o banco** nem com o R2 com chave.
- **Sem sessão válida, o banco não devolve nenhuma linha**, nem para o servidor.
- **Funções da Vercel:** 9 de 12 (teto do Hobby). Rota nova: juntar numa existente sempre que der.

## Variáveis (Vercel, só no servidor; só os nomes)

| Variável | Observação |
|---|---|
| `SUPABASE_URL` | do Portal, só a origem |
| `SUPABASE_PUBLISHABLE_KEY` | |
| `BIBLIOTECA_DB_TOKEN` | Sensitive |
| `PORTAL_URL` | |
| `PORTAL_SEGREDO` | pelo `portal-importek/scripts/ligar-app.mjs` |
| `CRON_SECRET` | 16 caracteres ou mais |
| `R2_CONTA`, `R2_CHAVE_ID`, `R2_CHAVE_SEGREDO`, `R2_BUCKET` | Fase 2 |

**Nunca** `SUPABASE_SERVICE_ROLE_KEY`. **Nunca** `vercel env pull` na pasta de rede.

## Rodar

O `npm` não roda na pasta de rede. Use uma cópia local (`docs/PASSO-A-PASSO.md`):
- `npm run dev`: modo demonstração em http://localhost:5174/biblioteca/
- `npm test`: testes
- `npm run test:build`: tipos, build e a prova de que a demonstração não vai para o build
