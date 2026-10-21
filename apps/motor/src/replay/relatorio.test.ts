import { describe, expect, it } from "vitest";
import { compararReplay, type SinalAvaliado } from "./comparacao.js";
import { relatorioMarkdown, type DadosDoRelatorio } from "./relatorio.js";

const lista: SinalAvaliado[] = Array.from({ length: 30 }, (_, i) => ({
  simbolo: "BTCUSDT",
  ate: i,
  aprovou: i < 10,
  retorno: i < 10 ? 0.05 : -0.02,
  resultadoUsd: i < 10 ? 50 : -20,
}));

const dados = (): DadosDoRelatorio => ({
  execucao: "p1-teste",
  janela: "2026-07-01 a 2026-10-20",
  simbolos: ["BTCUSDT", "ETHUSDT"],
  geradoEm: "2026-10-21",
  dadosAte: "2026-10-21T10:00Z",
  sinaisNaJanela: 35,
  analisados: 30,
  resolvidos: 30,
  sobraram: 5,
  semDesfecho: 0,
  custoTotalUsd: 12.3,
  nocionalUsd: 1000,
  comparacao: compararReplay(lista, { rodadas: 1000, semente: 3 }),
});

describe("RESULTADOS.md do replay", () => {
  const md = relatorioMarkdown(dados());

  it("traz o veredito, a tabela das três pontas e a precisão com Wilson", () => {
    expect(md).toMatch(/AGREGA/);
    expect(md).toContain("Regra pura (todos)");
    expect(md).toContain("Regra + Claude (aprovados)");
    expect(md).toContain("Aleatório (10 sorteados, média)");
    expect(md).toMatch(/Wilson 95%/);
    expect(md).toContain("10/10");
    expect(md).toContain("20/20");
  });

  it("registra contagens, custo e limites; números em pt-BR", () => {
    expect(md).toContain("Sobraram sem análise (passaram do máximo): 5");
    expect(md).toContain("US$ 12,30");
    expect(md).toContain("## Limites");
    expect(md).toContain("+100,00"); // 10 × 50 US$ nas aprovações
    expect(md).not.toMatch(/undefined|NaN/);
  });

  it("sem filtro, diz que não há veredito", () => {
    const todos = lista.map((s) => ({ ...s, aprovou: true }));
    const d = { ...dados(), comparacao: compararReplay(todos, { rodadas: 100, semente: 1 }) };
    expect(relatorioMarkdown(d)).toMatch(/SEM VEREDITO/);
  });
});
