import type { PortaAgendaEventos } from "@zentrade/contratos";
import type { EventoMercado } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { montarCenario } from "./teste/cenario.js";

const COPOM: EventoMercado = {
  data: "2026-10-10", // o dia de T0 em Brasília e em UTC
  mercado: "cripto",
  titulo: "Copom — decisão da Selic",
  impacto: "alto",
};

/** Agenda que o teste troca no meio do cenário e que anota o que foi perguntado. */
class AgendaTrocavel implements PortaAgendaEventos {
  readonly dias: string[] = [];
  constructor(public eventos: EventoMercado[]) {}
  async doDia(_roboId: string, dia: string): Promise<EventoMercado[]> {
    this.dias.push(dia);
    return this.eventos.filter((e) => e.data === dia);
  }
}

const quantidadeComprada = (c: ReturnType<typeof montarCenario>) => c.ordensEnviadas()[0]?.ordem.quantidade;

describe("filtro de dia de evento no motor", () => {
  it("ignorar (padrão): compra normal e nem consulta a agenda", async () => {
    const agenda = new AgendaTrocavel([COPOM]);
    const c = montarCenario({ agendaEventos: agenda });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    expect(agenda.dias).toEqual([]);
  });

  it("bloquear: barra a entrada e diz o evento", async () => {
    const c = montarCenario({
      agendaEventos: new AgendaTrocavel([COPOM]),
      limites: { diasDeEvento: "bloquear" },
    });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const decisao = c.decisoes.todas().at(-1);
    expect(decisao?.estado).toBe("barrada");
    expect(decisao?.risco.barreiras).toEqual([
      expect.objectContaining({
        codigo: "dia_de_evento",
        mensagem: expect.stringContaining("dia de evento: Copom — decisão da Selic"),
      }),
    ]);
  });

  it("bloquear em dia sem evento (ou com evento de outro mercado ou de impacto médio): compra normal", async () => {
    for (const eventos of [
      [],
      [{ ...COPOM, mercado: "win" as const }],
      [{ ...COPOM, impacto: "medio" as const }],
    ]) {
      const c = montarCenario({
        agendaEventos: new AgendaTrocavel(eventos),
        limites: { diasDeEvento: "bloquear" },
      });
      await c.aoVivo.iniciar();
      await c.fecharIntervalo(94);
      expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    }
  });

  it("reduzir: entra com metade do tamanho", async () => {
    const normal = montarCenario();
    await normal.aoVivo.iniciar();
    await normal.fecharIntervalo(94);
    const reduzido = montarCenario({
      agendaEventos: new AgendaTrocavel([COPOM]),
      limites: { diasDeEvento: "reduzir" },
    });
    await reduzido.aoVivo.iniciar();
    await reduzido.fecharIntervalo(94);
    const cheio = Number(quantidadeComprada(normal));
    expect(cheio).toBeGreaterThan(0);
    expect(Number(quantidadeComprada(reduzido))).toBeCloseTo(cheio / 2, 3);
    // o diário diz por que o tamanho é a metade
    expect(reduzido.decisoes.todas().at(-1)?.sinal.explicacao).toContain(
      "tamanho reduzido à metade — dia de evento: Copom",
    );
  });

  it("nunca barra a saída: stop e regra de saída executam em dia de evento", async () => {
    const agenda = new AgendaTrocavel([]);
    const c = montarCenario({ agendaEventos: agenda, limites: { diasDeEvento: "bloquear" } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    agenda.eventos = [COPOM]; // o evento aparece com a posição aberta
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas().at(-1)?.estado).toBe("executada");
  });

  it("o dia da cripto é o do fuso da instância (ZENTRADE_FUSO), não o de UTC", async () => {
    const agenda = new AgendaTrocavel([COPOM]);
    // 12:00 UTC de 10/10 já é 11/10 em UTC+14: o evento de 10/10 não vale mais
    const c = montarCenario({
      agendaEventos: agenda,
      fuso: "Pacific/Kiritimati",
      limites: { diasDeEvento: "bloquear" },
    });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(agenda.dias).toContain("2026-10-11");
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
  });

  it("agenda fora do ar: por precaução barra a entrada de quem pediu bloqueio, registra o erro e deixa sair", async () => {
    const quebrada: PortaAgendaEventos = {
      doDia: () => Promise.reject(new Error("banco fora")),
    };
    const c = montarCenario({ agendaEventos: quebrada, limites: { diasDeEvento: "bloquear" } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    expect(c.decisoes.todas().at(-1)?.risco.barreiras[0]).toMatchObject({ codigo: "dia_de_evento" });
    expect(c.erros.map((e) => e.msg).join(" ")).toContain("agenda de eventos");
  });
});
