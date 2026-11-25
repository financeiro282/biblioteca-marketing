// Padrão visual Importek · v1 · PRESET DO TAILWIND (para os sistemas em Tailwind 3).
// Fonte oficial: portal-importek/padrao-visual/v1/. ⚠️ Cópia num projeto não se edita.
//
// Uso no tailwind.config: `import padrao from './padrao-visual/tailwind-preset.js'` e
// `presets: [padrao]`. Os valores vêm das variáveis de tokens.css (importe-o no CSS de
// entrada antes das diretivas @tailwind).
//
// Cores, raios e sombras ficam no ROOT do tema (não em "extend") de propósito: as paletas e
// os raios padrão do Tailwind deixam de existir, então uma tela não consegue usar uma cor ou
// um canto fora do padrão. Espaçamento e tamanhos de texto: a escala padrão do Tailwind
// (múltiplos de 4px). É o tailwind.config.js do portal de 23/10/2026, sem mudar nada.
const v = (nome) => `var(--${nome})`;

export default {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      marca: { DEFAULT: v('cor-marca'), hover: v('cor-marca-hover') },
      'sobre-marca': v('cor-sobre-marca'),
      titulo: v('cor-titulo'),
      texto: v('cor-texto'),
      secundario: v('cor-secundario'),
      apagado: v('cor-apagado'),
      fundo: v('cor-fundo'),
      superficie: v('cor-superficie'),
      zebra: v('cor-zebra'),
      borda: { DEFAULT: v('cor-borda'), forte: v('cor-borda-forte'), campo: v('cor-borda-campo') },
      sucesso: v('cor-sucesso'),
      alerta: v('cor-alerta'),
      erro: { DEFAULT: v('cor-erro'), texto: v('cor-erro-texto') },
      veu: v('cor-veu'),
      serie: {
        1: v('cor-serie-1'), 2: v('cor-serie-2'), 3: v('cor-serie-3'), 4: v('cor-serie-4'),
        5: v('cor-serie-5'), 6: v('cor-serie-6'), 7: v('cor-serie-7'), 8: v('cor-serie-8'),
      },
    },
    borderRadius: { none: '0', DEFAULT: v('raio'), grande: v('raio-grande'), full: '9999px' },
    boxShadow: { none: 'none', janela: v('sombra-janela') },
    extend: {
      fontFamily: { sans: ['Nunito', 'system-ui', '"Segoe UI"', 'sans-serif'] },
      maxWidth: { entrada: v('largura-entrada') },
    },
  },
};
