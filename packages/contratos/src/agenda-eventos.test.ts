import { describe, expect, it } from "vitest";
import { ConsultaAgendaEsquema, NovoEventoMercadoEsquema, SugestaoEventosEsquema } from "./agenda-eventos.js";
import { LimitesRiscoEsquema } from "./dados.js";

const base = { data: "2026-10-28", mercado: "win", titulo: "Copom — decisão da Selic", impacto: "alto" };

describe("novo evento de mercado", () => {
  it("aceita o evento do dia todo e com janela, e apara o título", () => {
    expect(NovoEventoMercadoEsquema.parse({ ...base, titulo: "  Copom  " }).titulo).toBe("Copom");
    expect(NovoEventoMercadoEsquema.parse({ ...base, de: "14:00", ate: "15:30" })).toMatchObject({
      de: "14:00",
    });
  });

  it.each([
    ["data inexistente", { data: "2026-02-30" }],
    ["data com formato errado", { data: "28/10/2026" }],
    ["título vazio", { titulo: "   " }],
    ["mercado desconhecido", { mercado: "forex" }],
    ["impacto desconhecido", { impacto: "baixo" }],
    ["janela só com 'de'", { de: "14:00" }],
    ["janela invertida", { de: "15:00", ate: "14:00" }],
    ["hora inválida", { de: "25:00", ate: "26:00" }],
    ["campo a mais", { origem: "sugerido" }],
  ])("recusa: %s", (_nome, extra) => {
    expect(NovoEventoMercadoEsquema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
});

describe("consulta da agenda", () => {
  it("exige o período e limita a 400 dias", () => {
    expect(ConsultaAgendaEsquema.safeParse({ de: "2026-10-01", ate: "2026-10-31" }).success).toBe(true);
    expect(ConsultaAgendaEsquema.safeParse({ de: "2026-10-31", ate: "2026-10-01" }).success).toBe(false);
    expect(ConsultaAgendaEsquema.safeParse({ de: "2026-01-01", ate: "2027-12-31" }).success).toBe(false);
  });
});

describe("sugestão do Claude (dado não confiável)", () => {
  it("valida cada item; descarta lixo e limita a quantidade", () => {
    const ok = SugestaoEventosEsquema.parse({ eventos: [{ ...base, certeza: "alta" }] });
    expect(ok.eventos).toHaveLength(1);
    expect(
      SugestaoEventosEsquema.safeParse({ eventos: [{ ...base, certeza: "alta", executar: "rm -rf" }] })
        .success,
    ).toBe(false);
    expect(
      SugestaoEventosEsquema.safeParse({ eventos: Array(60).fill({ ...base, certeza: "alta" }) }).success,
    ).toBe(false);
  });
});

describe("limite do robô: dias de evento", () => {
  const limites = {
    perdaDiariaMaxima: "100",
    exposicaoMaxima: "1000",
    riscoPorOperacao: "10",
    ordensPorHoraMax: 6,
    pausaAposPerdaMin: 30,
    confiancaMinima: 0.6,
  };
  it("o padrão é ignorar; aceita bloquear e reduzir; recusa outro valor", () => {
    expect(LimitesRiscoEsquema.parse(limites).diasDeEvento).toBe("ignorar");
    expect(LimitesRiscoEsquema.parse({ ...limites, diasDeEvento: "reduzir" }).diasDeEvento).toBe("reduzir");
    expect(LimitesRiscoEsquema.safeParse({ ...limites, diasDeEvento: "parar" }).success).toBe(false);
  });
});
