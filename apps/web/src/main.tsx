import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "./estilos/tokens.css";
import "./estilos/base.css";
import "./estilos/componentes.css";
import "./estilos/feedback.css";
import "./estilos/layout.css";
import "./estilos/paginas.css";
import "./estilos/paginas2.css";
import "./estilos/decisao.css";
import "./estilos/construtor.css";
import "./estilos/aovivo.css";
import "./estilos/risco.css";
import "./estilos/interacoes.css";
import "./estilos/responsivo.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Fonte } from "./api/fonte";
import { criarFonteApi } from "./api/fonteApi";
import { App } from "./App";

/**
 * VITE_DEMO=1 liga o modo de demonstração: dados fictícios e mercado simulado no
 * navegador, sem API. O código do exemplo só entra no pacote quando é usado. A fonte
 * da API é importação estática: ela (e os esquemas Zod) vem junto com a entrada, em
 * paralelo, em vez de esperar a entrada rodar para só então ser pedida.
 */
async function escolherFonte(): Promise<Fonte> {
  if (import.meta.env.VITE_DEMO === "1") {
    const { criarFonteDemo } = await import("./demo/fonteDemo");
    return criarFonteDemo();
  }
  return criarFonteApi();
}

const elemento = document.getElementById("raiz");
if (!elemento) throw new Error("elemento #raiz não encontrado no index.html");

void escolherFonte().then((fonte) => {
  createRoot(elemento).render(
    <StrictMode>
      <App fonte={fonte} />
    </StrictMode>,
  );
});
