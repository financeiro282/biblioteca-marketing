# Roteiro de teste

Cada linha diz em que fase passa a valer. ✅ = já provado (data e como).

## Automáticos (rodar antes de qualquer publicação)

| O quê | Como | Situação |
|---|---|---|
| Banco: RLS, sessões, lixeira, busca, desfazer; zip e link externo (SQL 02) | `importek-sistemas/scripts/testa-banco-biblioteca.mjs` (PGlite, ver o LEIA-ME do banco) | ✅ 188/188 em 24/11 · ✅ 269/269 com o 02 · ✅ 311/311 com o 03 em 25/11 |
| Regras compartilhadas, servidor sem banco, modo demonstração (o zip é aberto pelo `tar` do Windows no teste) | `npm test` na pasta local | ✅ 17/17 em 24/11 · ✅ 47/47 em 25/11 |
| Tipos, build e nada da demonstração no build | `npm run test:build` | ✅ 24/11 |
| Cópia do padrão visual intacta | `node padrao-visual/conferir.mjs` | ✅ 24/11 |

## Validação pedida pelo Lucas (24/11/2026)

| # | Teste | Como | Fase |
|---|---|---|---|
| 1 | Enviar 300 fotos e um vídeo de vários GB; derrubar a conexão no meio e retomar | arrastar a pasta; desligar o Wi-Fi no meio do vídeo; religar → continua das partes que faltam. Fechar a aba e soltar os mesmos arquivos de novo → continua | 2 |
| 2 | Busca por evento, tag e data retornando o certo | buscar pelo nome do evento, por uma tag e por `dd/mm/aaaa`; conferir a contagem. No modo demonstração já dá para ver; no banco, provado no PGlite (seção 7b) | ✅ banco e demonstração · 3 com dados reais |
| 3 | Colaborador não vê "Sem autorização", nem pela API | com perfil Colaborador: o evento "Sem autorização" não aparece; abrir o endereço de um arquivo sem autorização → "não encontrado". Pela API: `GET /biblioteca/api/arquivos?id=<id>` → 404. No banco: PGlite seção 6 | ✅ banco e demonstração · 2 em produção |
| 4 | Link externo expira e pode ser revogado | criar link de 1 dia; mudar a validade no banco para o passado → página do link diz "expirado"; criar outro e revogar → "revogado". No banco: PGlite seção 10d (validade, revogação, senha, direito a cada acesso) | ✅ banco e demonstração · 4 em produção |
| 4b | Zip em segundo plano | pedir o zip de um evento; fechar a página; chega o aviso no Portal; baixar em Meus downloads e abrir no Windows. Arquivo acima de 1 GB fica fora (baixar direto). No banco: PGlite seção 10c (partes, retomada, 3 tentativas) | ✅ banco e demonstração · 4 em produção |
| 5 | Arquivo excluído vai para a lixeira e pode ser restaurado | Marketing exclui → some para todos; Administrador vê na lixeira e restaura → volta; "Apagar de vez" e os 30 dias (PGlite seção 10e). No banco: PGlite seção 8 | ✅ banco e demonstração · 5 em produção |
| 6 | Painel de uso bate com o espaço real | "Medir agora" no painel; comparar o "Armazenamento real" com o tamanho do bucket no Cloudflare (R2 → bucket → Metrics) | ✅ demonstração · 5 em produção |
| 7 | RLS: sem sessão, nada é lido | PGlite seção 5 (10 tabelas, 0 linhas; nada é gravado) e, em produção, chamada da API sem cookie → 401 | ✅ banco · 2 em produção |
| 8 | Restaurar da cópia de segurança | baixar um arquivo do B2 e comparar o SHA-256 com o do banco | 6 |
