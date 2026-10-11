import { EventoEsquema, type Evento } from "@zentrade/contratos/esquemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFonteDemo } from "./fonteDemo";

const AGORA = Date.UTC(2026, 9, 10, 15, 0, 0);

function ligar() {
  const fonte = criarFonteDemo({
    latenciaMs: [0, 0],
    agora: () => AGORA,
    tiqueMs: 60_000,
    primeiraAnaliseMs: 10,
    analiseCadaMs: 100,
    etapaMs: 1,
  });
  const eventos: Evento[] = [];
  const parar = fonte.tempoReal({ aoEvento: (e) => eventos.push(e), aoEstado: () => undefined });
  return { fonte, eventos, parar };
}

describe("simulação do exemplo (o motor de mentira)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("cada ciclo segue o motor: candle e sinal; com sinal, análise, decisão, ordem e posição", async () => {
    const { eventos, parar } = ligar();
    await vi.advanceTimersByTimeAsync(2000); // vários ciclos, entre os três robôs ativos
    parar();
    for (const e of eventos) expect(EventoEsquema.safeParse(e).success).toBe(true);
    const tipos = new Set(eventos.map((e) => e.tipo));
    for (const t of ["candle", "sinal", "analise", "decisao", "ordem", "posicao"]) expect(tipos).toContain(t);
    const sinais = eventos.flatMap((e) => (e.tipo === "sinal" ? [e.acao] : []));
    expect(sinais).toContain("AGUARDAR");
    expect(sinais).toContain("COMPRAR");
    expect(sinais).toContain("VENDER"); // o robô automático vende a posição aberta
    const ordens = eventos.flatMap((e) => (e.tipo === "ordem" ? [e.ordem] : []));
    expect(ordens.find((o) => o.estado === "PENDENTE")?.execucoes).toEqual([]);
    expect(ordens.some((o) => o.lado === "VENDA" && o.estado === "PREENCHIDA")).toBe(true);
  });

  it("guarda o histórico por robô para a tela abrir preenchida", async () => {
    const { fonte, parar } = ligar();
    const antes = await fonte.aoVivo();
    expect(antes.length).toBeGreaterThan(0); // já abre com as últimas decisões e ordens
    await vi.advanceTimersByTimeAsync(600);
    parar();
    const todos = await fonte.aoVivo();
    expect(todos.length).toBeGreaterThan(antes.length);
    const sol = await fonte.aoVivo("r-sol");
    expect(sol.length).toBeGreaterThan(0);
    expect(sol.every((r) => r.evento.tipo !== "preco")).toBe(true);
    const ordens = sol.flatMap((r) => (r.evento.tipo === "ordem" ? [r.evento.ordem] : []));
    expect(ordens.length).toBeGreaterThan(0);
    await expect(fonte.aoVivo("nao-existe")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });
});
