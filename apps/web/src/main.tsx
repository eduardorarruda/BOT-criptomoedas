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
import "./estilos/primeiros-passos.css";
import "./estilos/interacoes.css";
import "./estilos/responsivo.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Fonte } from "./api/fonte";
import { criarFonteApi } from "./api/fonteApi";
import { App } from "./App";
import { carregarFusoDaInstancia } from "./lib/fuso";

/**
 * VITE_DEMO=1 liga o modo de demonstração: dados fictícios e mercado simulado no
 * navegador, sem API. O código do exemplo só entra no pacote quando é usado. A fonte
 * da API é importação estática: ela (e os esquemas Zod) vem junto com a entrada, em
 * paralelo, em vez de esperar a entrada rodar para só então ser pedida. No exemplo,
 * `?vazio=1` abre como uma instalação nova (para ver a primeira vez).
 */
function sessaoDaAba(): Storage | undefined {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}

async function escolherFonte(): Promise<Fonte> {
  if (import.meta.env.VITE_DEMO === "1") {
    const [{ criarFonteDemo }, { lerModoVazio }] = await Promise.all([
      import("./demo/fonteDemo"),
      import("./demo/vazio"),
    ]);
    return criarFonteDemo({ vazio: lerModoVazio(location.search, sessaoDaAba()) });
  }
  return criarFonteApi();
}

const elemento = document.getElementById("raiz");
if (!elemento) throw new Error("elemento #raiz não encontrado no index.html");

/**
 * O fuso da instância (ZENTRADE_FUSO) vem da config pública antes de desenhar: o "hoje"
 * da tela é o mesmo do motor. Sem resposta da API, vale o horário de Brasília.
 */
async function iniciar(): Promise<Fonte> {
  const fonte = await escolherFonte();
  await carregarFusoDaInstancia(() => fonte.configPublica());
  return fonte;
}

void iniciar().then((fonte) => {
  createRoot(elemento).render(
    <StrictMode>
      <App fonte={fonte} />
    </StrictMode>,
  );
});
