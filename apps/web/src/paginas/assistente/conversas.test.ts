import type { ConversaResumo } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { agruparConversas, filtrarConversas, tituloDaPergunta } from "./conversas";

const DIA = 86_400_000;
// 11/10/2026 15:00 em Brasília (o fuso da instância, não o do navegador).
const AGORA = Date.parse("2026-10-11T15:00:00-03:00");

const conversa = (id: string, atualizadaEm: number, titulo = id, previa = ""): ConversaResumo => ({
  id,
  titulo,
  previa,
  criadaEm: atualizadaEm,
  atualizadaEm,
});

describe("agruparConversas", () => {
  it("separa em Hoje, Últimos 7 dias e Mais antigas, a mais recente primeiro", () => {
    const meiaNoite = Date.parse("2026-10-11T00:00:00-03:00");
    const grupos = agruparConversas(
      [
        conversa("antiga", AGORA - 30 * DIA),
        conversa("hoje-cedo", meiaNoite + 60_000),
        conversa("ontem", meiaNoite - 60_000),
        conversa("hoje-agora", AGORA - 60_000),
        conversa("seis-dias", AGORA - 6 * DIA),
        conversa("oito-dias", AGORA - 8 * DIA),
      ],
      AGORA,
    );
    expect(grupos.map((g) => [g.rotulo, g.conversas.map((c) => c.id)])).toEqual([
      ["Hoje", ["hoje-agora", "hoje-cedo"]],
      ["Últimos 7 dias", ["ontem", "seis-dias"]],
      ["Mais antigas", ["oito-dias", "antiga"]],
    ]);
  });

  it("omite grupos vazios e lista vazia não tem grupos", () => {
    expect(agruparConversas([conversa("a", AGORA)], AGORA).map((g) => g.rotulo)).toEqual(["Hoje"]);
    expect(agruparConversas([], AGORA)).toEqual([]);
  });

  it("conversa com data no futuro (relógio adiantado) fica em Hoje", () => {
    expect(agruparConversas([conversa("f", AGORA + DIA)], AGORA)[0]?.rotulo).toBe("Hoje");
  });
});

describe("filtrarConversas", () => {
  const lista = [
    conversa("1", AGORA, "Carteira cripto", "Resumo do BTC"),
    conversa("2", AGORA, "Títulos de renda fixa", "Vencimentos em 2027"),
  ];

  it("busca no título e na prévia, sem diferenciar maiúsculas nem acentos", () => {
    expect(filtrarConversas(lista, "titulos").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarConversas(lista, "BTC").map((c) => c.id)).toEqual(["1"]);
    expect(filtrarConversas(lista, "  RENDA  ").map((c) => c.id)).toEqual(["2"]);
  });

  it("termo vazio devolve tudo", () => {
    expect(filtrarConversas(lista, "   ")).toBe(lista);
  });
});

describe("tituloDaPergunta", () => {
  it("usa a pergunta numa linha só e corta com reticências", () => {
    expect(tituloDaPergunta("  Como estão\n os robôs?  ")).toBe("Como estão os robôs?");
    const longa = "a".repeat(100);
    expect(tituloDaPergunta(longa)).toHaveLength(60);
    expect(tituloDaPergunta(longa).endsWith("…")).toBe(true);
  });
});
