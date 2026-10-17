import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { App } from "../App";
import { criarFonteDemo } from "../demo/fonteDemo";

/**
 * Checagem automática de acessibilidade (axe-core) com a aplicação inteira: rotas,
 * casca e dados do exemplo. O jsdom não desenha, então o contraste de cor fica de
 * fora (os tokens do tema foram conferidos para AA) e o gráfico vira um substituto.
 * Quem usa precisa de `vi.mock("lightweight-charts", () => import("../teste/graficoFalso"))`.
 */
const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};

/** A app inteira com o axe é lenta sob cobertura e com os outros pacotes rodando juntos. */
export const PRAZO_TELA_MS = 90_000;

export interface OpcoesTela {
  /** false abre sem sessão (tela de entrar). */
  readonly sessao?: boolean;
  /** Passo depois da primeira tela (ex.: abrir um item pelo link); devolve o título da tela final. */
  readonly depois?: () => Promise<RegExp>;
  /** Abre o exemplo como instalação nova (sem robôs, estratégias nem histórico). */
  readonly vazio?: boolean;
}

export async function violacoesNaTela(
  caminho: string,
  titulo: RegExp,
  { sessao = true, depois, vazio = false }: OpcoesTela = {},
): Promise<string[]> {
  if (sessao) sessionStorage.setItem("zentrade:demo:sessao", "1");
  else sessionStorage.removeItem("zentrade:demo:sessao");
  window.history.pushState({}, "", caminho);
  render(<App fonte={criarFonteDemo({ latenciaMs: [0, 0], primeiraAnaliseMs: 60_000, vazio })} />);
  await screen.findByRole("heading", { level: 1, name: titulo }, { timeout: 30_000 });
  if (depois) {
    const final = await depois();
    await screen.findByRole("heading", { level: 1, name: final }, { timeout: 30_000 });
  }
  await new Promise((r) => setTimeout(r, 200)); // as consultas da página chegam
  const r = await axe.run(document.body, OPCOES_AXE);
  window.history.pushState({}, "", "/");
  return r.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html.slice(0, 200)).join(" | ")})`,
  );
}
