import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { lerOpcoesSeo, robotsTxt, sitemapXml, tagsDoBuild, type OpcoesSeo } from "./src/lib/cabeca";

const VERSAO = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }
).version;

/**
 * Cabeça para buscadores: robôs, endereço, imagem social e JSON-LD no index.html;
 * robots.txt e sitemap.xml no build (e no servidor de desenvolvimento). Privado por
 * padrão; VITE_PUBLICO=1 + VITE_URL_PUBLICA liga a indexação (docs/operacao.md).
 */
function cabecaSeo(opcoes: OpcoesSeo): Plugin {
  const robots = robotsTxt(opcoes);
  const sitemap = sitemapXml(opcoes, new Date().toISOString().slice(0, 10));
  return {
    name: "zentrade-cabeca-seo",
    transformIndexHtml: () => tagsDoBuild(opcoes).map((t) => ({ ...t, injectTo: "head" as const })),
    configureServer(servidor) {
      servidor.middlewares.use((req, res, seguir) => {
        const corpo = req.url === "/robots.txt" ? robots : req.url === "/sitemap.xml" ? sitemap : undefined;
        if (corpo === undefined || corpo === null) return seguir();
        res.setHeader(
          "Content-Type",
          req.url === "/robots.txt" ? "text/plain; charset=utf-8" : "application/xml",
        );
        res.end(corpo);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      if (sitemap) this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
    },
  };
}

/**
 * A tela importa só `@zentrade/contratos/esquemas`, que não tem código de servidor
 * (node:crypto fica na assinatura dos webhooks, fora desse subcaminho).
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), cabecaSeo(lerOpcoesSeo(loadEnv(mode, process.cwd(), "VITE_"), VERSAO))],
  define: { __ZENTRADE_VERSAO__: JSON.stringify(VERSAO) },
  server: {
    port: 5173,
    proxy: {
      // ZENTRADE_API_ALVO aponta a tela de desenvolvimento para outra API (ex.: http://127.0.0.1:8095).
      "/api": {
        target: process.env.ZENTRADE_API_ALVO ?? "http://localhost:8080",
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: { target: "es2023", sourcemap: true },
  test: {
    environment: "jsdom",
    // Testes de interação (teclado, arrastar) e o axe na app inteira passam de 20 s quando o
    // turbo roda todos os pacotes juntos numa máquina carregada.
    testTimeout: 60_000,
    globals: true,
    setupFiles: ["./src/teste/preparar.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/api/**/*.ts",
        "src/construtor/**/*.ts",
        "src/ganchos/**/*.ts",
        "src/demo/**/*.ts",
        "src/componentes/graficos/velas.ts",
        "src/paginas/patrimonio/**/*.ts",
        "src/componentes/filtros/**/*.ts",
        "src/paginas/assistente/**/*.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
}));
