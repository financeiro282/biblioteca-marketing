# Padrão visual Importek · v1 (1.0.0, 2026-11-05)

Um padrão só para todos os sistemas internos da Importek: o do **Portal Importek**. Sóbrio e
institucional: sem emoji, sem ícone decorativo, sem gradiente, sem sombra fora das janelas, sem
canto muito arredondado, sem texto de ajuda em tom de conversa. **Não há modo escuro.**

**Fonte oficial:** `portal-importek/padrao-visual/v1/`. Cada sistema tem uma **cópia numerada**,
feita pelo script do portal, e a cópia **não se edita**: mudar o padrão é mudar no portal, numa
versão nova, e copiar de novo. Detalhe em "Versões e cópias", no fim.

| Arquivo | O que é |
|---|---|
| `tokens.css` | as variáveis: cores, raios, sombra, larguras, fonte. Sozinho não muda nada na tela |
| `componentes.css` | as peças em classes `pi-*`, para qualquer stack (React, HTML puro, HTML gerado por Python) |
| `tailwind-preset.js` | o tema do Tailwind 3 com os mesmos nomes do portal (`bg-marca`, `text-secundario`…) |
| `moldura.js` | o menu do celular da moldura, para sistemas sem React |
| `vitrine.html` | todas as peças numa página: abra direto do arquivo para conferir e comparar |
| `conferir.mjs` | no projeto: `node <pasta da cópia>/conferir.mjs` acusa edição na cópia |
| `logo-importek-cor.png` | o logo da barra lateral e das telas de entrada |

## Fora do padrão (não muda)

- **Tudo que o cliente vê:** páginas de proposta e de contrato, pesquisa pública do NPS, PDFs, e-mails.
- **O player do Sua_TV** que roda nas TVs.
- O **conteúdo** de cada sistema (gráficos do Dash, mapa de território da Proposta, calendário da
  Agenda) continua mostrando o mesmo e funcionando igual; muda só para as cores, a fonte e as peças daqui.

## Regras

- **Amarelo** (`--cor-marca`) só na **ação principal** e no **item ativo da navegação**. Nunca fundo de área.
- **Hierarquia** por tamanho e peso, não por cor. Texto de apoio em `--cor-secundario`;
  `--cor-apagado` só em placeholder e desabilitado.
- **Uma ação principal por tela.** As demais em contorno ou texto. Ação destrutiva só dentro da
  janela de confirmação, em "perigo" (contorno, não vermelho cheio).
- **Situação** = bolinha + palavra curta (`pi-status`). Nunca selo colorido grande.
- **Textos:** só o funcional, curto e neutro. Sem boas-vindas, sem "obrigado por utilizar", sem frase
  motivacional. Erro diz o que aconteceu e o que fazer.
- **Ícone:** nenhum decorativo. Botões e menus só com texto. Símbolos tipográficos (✓, ▲, ▼) só quando
  carregam informação e vêm com texto ao lado.
- **Movimento:** passar o mouse muda cor, borda ou sublinhado; nada cresce, pula ou brilha.
- **Datas** `dd/mm/aaaa HH:MM`; **números** à direita com algarismos de mesma largura (`pi-num`); R$ no
  formato brasileiro.
- **Responsivo:** desktop, notebook (1366×768) e celular, **sem rolagem horizontal na página**. Tabela
  larga esconde colunas secundárias no celular (`pi-so-largo`) em vez de rolar para o lado.

## Tokens

| Variável | Valor | Uso |
|---|---|---|
| `--cor-marca` / `-hover` | `#f5e61b` / `#e8d912` | ação principal, item ativo |
| `--cor-sobre-marca` | `#23231f` | texto sobre o amarelo |
| `--cor-titulo` | `#23231f` | títulos, valor em destaque, foco |
| `--cor-texto` | `#3a3a35` | texto corrido |
| `--cor-secundario` | `#66665d` | texto de apoio (contraste AA) |
| `--cor-apagado` | `#9b9b91` | placeholder, desabilitado |
| `--cor-fundo` | `#fafaf5` | fundo da página |
| `--cor-superficie` | `#ffffff` | cartões, tabelas, campos, barra lateral |
| `--cor-zebra` | `#f4f4ec` | item ativo, destaque leve |
| `--cor-borda` / `-forte` / `-campo` | `#ecece2` / `#d4d4c4` / `#8f8f85` | separadores / cabeçalho de tabela / campos e contorno |
| `--cor-sucesso` / `--cor-alerta` / `--cor-erro` | `#22a45d` / `#f09c1f` / `#e05252` | bolinha de situação, faixa de aviso |
| `--cor-erro-texto` | `#b8392f` | erro escrito |
| `--cor-veu` | `rgba(35,35,31,.45)` | fundo atrás de janela e do menu do celular |
| `--cor-serie-1` … `-8` | amarelo, `#23231f`, `#8f8f85`, `#3b82c4`, `#22a45d`, `#f09c1f`, `#8b5fc0`, `#e05252` | **só gráficos**, nessa ordem |
| `--raio` / `--raio-grande` | 6px / 8px | campos e botões / cartões, tabelas, janelas |
| `--sombra-janela` | `0 12px 32px rgba(35,35,31,.12)` | a única sombra: janelas |
| `--largura-lateral` / `--largura-conteudo` / `--largura-entrada` | 240px / 1152px / 400px | moldura |
| `--fonte-padrao` | Nunito, system-ui, Segoe UI | pesos **400, 600 e 700** |

**Tamanhos de texto:** 12px (cabeçalho de tabela, detalhe), 14px (botões, tabelas, rótulos, menu),
**16px nos campos** (menor que isso o celular dá zoom), 16px título de cartão, 20px título de tela de
entrada, 24px título da página. **Espaçamento:** múltiplos de 4px.

**Carregar a fonte** (no `<head>`):
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" />
```
Sistema com política de segurança (CSP) precisa liberar `fonts.googleapis.com` e `fonts.gstatic.com`;
quem já serve a Nunito do próprio servidor (Sua_TV) pode continuar assim.

## Moldura dos sistemas

A mesma do portal: **barra lateral fixa de 240px, só com texto**. No alto, o logo e o nome do sistema;
no meio, a navegação; embaixo, a pessoa logada, **"Voltar ao portal"** e **"Sair"**. Abaixo de 1024px
a barra vira um menu que abre por cima, pelo botão "Menu" de uma barra no topo. Conteúdo com no máximo
1152px, respiro de 16px no celular e 32px a partir de 768px; título da página em 24px.

```html
<div class="pi-moldura">
  <header class="pi-barra-celular">
    <a class="pi-logo" href="/"><img src="…/logo-importek-cor.png" alt="Importek" width="150" height="47"></a>
    <button type="button" class="pi-botao-texto" data-pi-menu-abrir aria-expanded="false">Menu</button>
  </header>
  <div class="pi-veu-menu" aria-hidden="true"></div>
  <aside class="pi-lateral" aria-label="Menu do sistema">
    <div class="pi-lateral-topo">
      <a class="pi-logo" href="/"><img src="…/logo-importek-cor.png" alt="Importek" width="150" height="47"></a>
      <button type="button" class="pi-botao-texto pi-so-celular" data-pi-menu-fechar>Fechar</button>
    </div>
    <p class="pi-nome-sistema">Nome do sistema</p>
    <nav class="pi-nav" aria-label="Principal">
      <a class="pi-nav-item" href="…" aria-current="page">Tela ativa</a>
      <p class="pi-nav-grupo">Grupo (opcional)</p>
      <a class="pi-nav-item" href="…">Outra tela</a>
    </nav>
    <div class="pi-lateral-rodape">
      <div class="pi-pessoa"><p class="pi-pessoa-nome">Nome da pessoa</p><p class="pi-pessoa-detalhe">e-mail ou perfil</p></div>
      <a class="pi-nav-item" href="https://portal-importek.vercel.app">Voltar ao portal</a>
      <button type="button" class="pi-nav-item">Sair</button>
    </div>
  </aside>
  <main class="pi-conteudo">
    <div class="pi-conteudo-interno">          <!-- + pi-largo: calendário, mapa -->
      <div class="pi-cabecalho-pagina"><h1 class="pi-titulo-pagina">Título</h1><!-- ações --></div>
      …
    </div>
  </main>
</div>
<script src="…/moldura.js"></script>          <!-- só sem React -->
```
- **"Voltar ao portal"** leva aos cards do portal sem sair dele; **"Sair"** é o sair do sistema (cada um
  já tem o seu). Sistema fora do login único (Sua_TV) mostra "Voltar ao portal" como link simples.
- Item ativo: `aria-current="page"` (ou a classe `ativo`). Grupos de menu: `pi-nav-grupo`.
- Em React, o menu do celular é estado do componente (como o `Layout.tsx` do portal): classe `aberta`
  na `.pi-lateral` e `aberto` no `.pi-veu-menu`.

## Peças

Classe CSS (qualquer sistema) | No portal (React + Tailwind) | Observação
---|---|---
`pi-botao-principal`, `-contorno`, `-texto`, `-perigo` | `BOTAO.*` | 40px de altura; desabilitado com `disabled`
`pi-grupo` > `pi-rotulo` + `pi-campo` + `pi-campo-erro` ou `pi-campo-ajuda` | `<Campo>` + `CAMPO` | vale para input, select e textarea
`pi-tabela-caixa` > `table.pi-tabela`; `pi-num`; `pi-so-largo` | `TABELA.*` | número à direita; coluna secundária some no celular
`pi-cartao` + `pi-cartao-titulo` | `<Cartao>` |
`pi-status` + `pi-status-sucesso` / `-alerta` / `-erro` (sem = neutro) | `<Status>` | bolinha + palavra curta
`pi-aviso` + `pi-aviso-alerta` / `-erro` | `<Aviso>` | `role="status"` no neutro, `role="alert"` nos outros
`pi-aviso-flutuante` | `Toaster` (sonner) | neutro, no alto e no centro; some sozinho
`pi-carregando`, `pi-vazio` | `<Carregando>` | o vazio diz o que não há e o que fazer
`pi-veu` > `pi-janela` > `-cabecalho` (`-titulo` + "Fechar" em `pi-botao-texto`), `-corpo`, `-rodape` | `<Janela>` | fecha no Esc e no fundo; trava a rolagem da página
`pi-abas` > `pi-aba[aria-selected]` | (v1, novo) | texto; ativa com traço amarelo; quebra linha no celular
`pi-filtros`; `pi-opcoes` > `pi-opcao[aria-pressed]` | (v1, novo) | escolha única: fundo leve, sem amarelo
`pi-entrada` > `pi-entrada-miolo` > logo, `pi-entrada-cartao`, `pi-entrada-rodape` | `<MolduraEntrada>` | login, sem acesso, troca de senha
`pi` | `body` do portal | liga fonte, cor, fundo e foco numa área (o padrão não tem regra global)

⚠️ **Nenhuma regra global.** `componentes.css` não estiliza `body`, `button` nem `input` soltos: tudo
depende da classe. Em vários sistemas a mesma página carrega telas do cliente, que ficam fora do padrão.

## Como adotar, por tipo de sistema

- **Tailwind 3** (portal, NPS): importar `tokens.css` no CSS de entrada, **antes** das diretivas
  `@tailwind`; `presets: [padrao]` no `tailwind.config`. As telas usam os nomes (`bg-marca`,
  `border-borda-campo`, `rounded-grande`…). Cor ou raio fora do padrão deixa de existir.
- **CSS próprio, React sem Tailwind** (Dashboard Financeiro, Proposta): importar `tokens.css` e
  `componentes.css` uma vez, na entrada do painel, e usar as classes `pi-*`. Estilo escrito no código
  usa as variáveis (`color: 'var(--cor-secundario)'`), nunca cor solta.
- **HTML puro** (Agenda, painel do Sua_TV): `<link>` para os dois CSS e `<script src="moldura.js">`.
- **HTML gerado por Python** (Dash): o gerador lê os arquivos da cópia **na hora de gerar** e embute no
  HTML, como já faz com o resto do CSS.

## Validação de um sistema migrado

1. **Lado a lado com o portal** (e com `vitrine.html`): moldura, botões, campos, tabelas e cartões iguais.
2. **Telas:** 1920, **1366×768** e celular (390px): sem rolagem horizontal; menu do celular abre e fecha.
3. **Comportamento:** passar o mouse, foco pelo teclado (contorno escuro visível) e desabilitado em
   botões e campos.
4. **Funcionalidade e números idênticos** aos de antes: login único, filtros, formulários, exportações,
   mapas, gráficos.
5. **Console** sem erro novo.
6. `node <pasta da cópia>/conferir.mjs` → `ok`.

## Versões e cópias

- **Versão = pasta** (`v1`, `v2`…), com `versao.json` (número e data). Uma versão publicada não muda;
  ajuste vira versão nova (1.0.1, 1.1.0 ou v2), anotada no `REGISTRO.md` do portal.
- **Copiar para um sistema** (no portal): `node scripts/copiar-padrao.mjs "<pasta do projeto>"
  [--subpasta public/padrao-visual] [--versao v1]`. O script grava `copia.json` com o sha256 de cada
  arquivo e se recusa a passar por cima de uma cópia editada (a não ser com `--forcar`).
- **Cada sistema troca de versão quando for testado.** O `REGISTRO.md` do projeto diz qual versão ele usa.
- **Por que cópia e não um CSS carregado do portal:** um sistema não lê arquivo de outro projeto em
  tempo de execução; se o portal sair do ar ou publicar algo errado, nenhum sistema muda de aparência.
  Pacote npm ficou de fora porque três sistemas não têm etapa de build (Agenda, Sua_TV, Dash).

### Histórico
- **1.0.0 (2026-11-05):** primeira versão. Os tokens e as peças do portal de 23/10/2026, mais as peças que o
  portal ainda não tinha: abas, filtros, vazio, aviso flutuante em CSS, paleta de gráficos, moldura dos
  sistemas (nome do sistema, "Voltar ao portal") e grupos de menu.
