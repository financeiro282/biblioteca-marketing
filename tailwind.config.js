/** @type {import('tailwindcss').Config} */
// Padrão visual Importek v1 (cópia em padrao-visual/, feita pelo script do Portal — não editar).
// Cores, raios e sombras vêm do preset: as paletas padrão do Tailwind não existem aqui.
import padrao from './padrao-visual/tailwind-preset.js';

export default {
  presets: [padrao],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [],
};
