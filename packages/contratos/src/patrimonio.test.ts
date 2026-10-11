import { describe, expect, it } from "vitest";
import { CLASSES_PATRIMONIO, PatrimonioEsquema, type Patrimonio } from "./esquemas.js";

const classe = (
  sobrescrever: Partial<Patrimonio["classes"][number]> = {},
): Patrimonio["classes"][number] => ({
  classe: "renda_fixa",
  situacao: "completa",
  valor: "5000.00",
  investido: "4800",
  fracao: "0.5",
  itens: 2,
  atualizadoEm: 1_790_000_000_000,
  moedaOrigem: null,
  avisos: [],
  ...sobrescrever,
});

const patrimonio: Patrimonio = {
  moeda: "BRL",
  total: "10000",
  parcial: false,
  calculadoEm: 1_790_000_000_000,
  cambio: { par: "USDTBRL", preco: "5.4321", em: 1_790_000_000_000, fonte: "binance" },
  classes: [
    classe({
      classe: "cripto",
      investido: null,
      moedaOrigem: { moeda: "USDT", valor: "920.5" },
      avisos: ["custo em reais desconhecido"],
    }),
    classe(),
    classe({ classe: "imobiliario", fracao: null, situacao: "vazia", valor: "0", itens: 0 }),
  ],
  avisos: [],
};

describe("contrato do patrimônio", () => {
  it("as três classes, na ordem em que a tela mostra", () => {
    expect(CLASSES_PATRIMONIO).toEqual(["cripto", "renda_fixa", "imobiliario"]);
  });

  it("aceita o patrimônio completo e o que não tem câmbio", () => {
    expect(PatrimonioEsquema.parse(patrimonio)).toEqual(patrimonio);
    const semCambio = {
      ...patrimonio,
      parcial: true,
      cambio: null,
      classes: [classe({ classe: "cripto", situacao: "indisponivel", valor: null, fracao: null })],
    };
    expect(PatrimonioEsquema.safeParse(semCambio).success).toBe(true);
  });

  it("dinheiro é texto decimal, nunca número", () => {
    expect(PatrimonioEsquema.safeParse({ ...patrimonio, total: 10000 }).success).toBe(false);
    expect(PatrimonioEsquema.safeParse({ ...patrimonio, classes: [classe({ valor: "1e3" })] }).success).toBe(
      false,
    );
  });

  it("só reais no total e situação conhecida em cada classe", () => {
    expect(PatrimonioEsquema.safeParse({ ...patrimonio, moeda: "USD" }).success).toBe(false);
    const estranha = { ...patrimonio, classes: [{ ...classe(), situacao: "talvez" }] };
    expect(PatrimonioEsquema.safeParse(estranha).success).toBe(false);
  });
});
