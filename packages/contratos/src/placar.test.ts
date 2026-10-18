import { calcularPlacar, dec, type DecisaoPlacar } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { DecisaoEsquema } from "./dados.js";
import { FiltroPlacarEsquema, PlacarEsquema, placarParaDTO } from "./placar.js";

const d = (claude: DecisaoPlacar["claude"], confianca: number, resultado: number | null): DecisaoPlacar => ({
  id: `${claude}-${confianca}-${resultado}`,
  em: 1,
  claude,
  confianca,
  fonte: "contrafactual",
  resultado: resultado === null ? null : dec(resultado),
  retorno: resultado === null ? null : resultado / 100,
  moeda: "USDT",
  roboId: "r1",
  roboNome: "BTC 5m",
  estrategiaId: "e1",
  estrategiaNome: "Rompimento",
  mercado: "cripto",
});

describe("placar no contrato", () => {
  it("o placar do domínio vira um DTO válido, com dinheiro em texto e o resumo de cada grupo", () => {
    const p = calcularPlacar([d("aprovou", 0.9, 1.5), d("vetou", 0.7, -2), d("aprovou", 0.6, null)]);
    const dto = PlacarEsquema.parse(placarParaDTO(p, 1000));
    expect(dto.total.dinheiro?.aprovadas).toBe("1.5");
    expect(dto.total.limite?.resultado).toBe("1.5");
    expect(dto.meta).toBe(0.8);
    expect(dto.porRobo[0]?.metricas.resumo).toContain("no robô BTC 5m");
    expect(dto.total.resumo).toContain("Nos últimos 2 sinais avaliados,");
  });

  it("sem decisões continua válido", () => {
    expect(() => PlacarEsquema.parse(placarParaDTO(calcularPlacar([]), 0))).not.toThrow();
  });

  it("filtro: roboId precisa ser uuid; desde vem da querystring como texto", () => {
    expect(FiltroPlacarEsquema.parse({ desde: "1700000000000" })).toEqual({ desde: 1_700_000_000_000 });
    expect(FiltroPlacarEsquema.safeParse({ roboId: "x" }).success).toBe(false);
  });

  it("a decisão aceita a avaliação do placar", () => {
    const decisao = DecisaoEsquema.parse({
      id: "d1",
      roboId: "r1",
      em: 1,
      sinal: { acao: "COMPRAR", explicacao: "rompeu" },
      preco: "100",
      risco: { aprovada: false, barreiras: [] },
      estado: "registrada",
      avaliacao: {
        claude: "vetou",
        confianca: 0.7,
        fonte: "contrafactual",
        situacao: "concluida",
        motivo: "stop",
        resultado: "-2",
        retorno: -0.02,
        barras: 3,
        acertou: true,
        moeda: "USDT",
        avaliadaEm: 2,
      },
    });
    expect(decisao.avaliacao?.acertou).toBe(true);
  });
});
