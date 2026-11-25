import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

// ENDEREÇO ÚNICO: a Biblioteca abre DENTRO do Portal, em portal-importek…/biblioteca/ (o Portal repassa).
//
// MODO DEMONSTRAÇÃO (demo/plugin-demo.mjs): SÓ no `npm run dev`. O arquivo é carregado com import() apenas
// quando o comando é "serve" — no `npm run build` nem é lido, e nada dele vai para dist/ (prova: `npm run test:build`).
// Desligar no dev (ex.: `vercel dev` com as funções de verdade): BIBLIOTECA_SEM_DEMO=1.
export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  if (command === "serve" && process.env.BIBLIOTECA_SEM_DEMO !== "1") {
    const { default: pluginDemo } = await import("./demo/plugin-demo.mjs");
    plugins.push(pluginDemo());
  }
  return {
    plugins,
    base: "/biblioteca/",
    build: { sourcemap: false },
    server: { host: "localhost", port: 5174, strictPort: false },
  };
});
