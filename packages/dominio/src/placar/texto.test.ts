import { describe, expect, it } from "vitest";
import { dec } from "../dinheiro.js";
import { metricasDoPlacar, type DecisaoPlacar } from "./metricas.js";
import { resumoDoPlacar } from "./texto.js";

const d = (claude: DecisaoPlacar["claude"], confianca: number, resultado: number | null): DecisaoPlacar => ({
  id: `${claude}${confianca}${resultado}`,
  em: 0,
  claude,
  confianca,
  fonte: "contrafactual",
  resultado: resultado === null ? null : dec(resultado),
  retorno: resultado === null ? null : resultado / 100,
  moeda: "USDT",
  roboId: "r",
  roboNome: "BTC",
  estrategiaId: "e",
  estrategiaNome: "E",
  mercado: "cripto",
});

describe("resumo do placar em texto (para o próprio Claude ler)", () => {
  it("aprovações, vetos, dinheiro, payoff, calibração, limite e o aviso de poucas amostras", () => {
    const m = metricasDoPlacar([
      d("aprovou", 0.9, 10),
      d("aprovou", 0.7, -4),
      d("vetou", 0.8, -6),
      d("vetou", 0.6, 5),
      d("aprovou", 0.75, null),
    ]);
    const texto = resumoDoPlacar(m, "neste robô");
    expect(texto).toContain("Nos últimos 4 sinais avaliados neste robô");
    expect(texto).toContain("você aprovou 2 e acertou 1 (50%");
    expect(texto).toContain("vetou 2 e 1 veto estava certo (50%)");
    expect(texto).toContain("suas aprovações somaram 6 USDT; aprovar tudo teria dado 5 USDT");
    expect(texto).toContain("você agregou 1 USDT");
    expect(texto).toContain("acertar 28,6%");
    expect(texto).toContain("confiança ≥ 0,75");
    expect(texto).toContain("1 pendente");
    expect(texto).toMatch(/menos de 30/);
  });

  it("sem nada avaliado, diz isso em uma frase", () => {
    expect(resumoDoPlacar(metricasDoPlacar([]), "neste robô")).toMatch(/ainda não há/i);
  });

  it("quando o Claude tirou dinheiro, diz que tirou", () => {
    const m = metricasDoPlacar([d("aprovou", 0.9, -1), d("vetou", 0.9, 5)]);
    expect(resumoDoPlacar(m, "")).toContain("você tirou 5 USDT");
    expect(resumoDoPlacar(m, "")).toContain("nenhum limite de confiança chegou a 80%");
  });
});
