import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, LIMITES, type Cenario } from "./ajuda.js";
import { comoUsuario } from "../cliente.js";
import { portaAgendaEventos } from "../portas/agenda-eventos.js";

const COPOM = {
  data: "2026-10-28",
  mercado: "win",
  titulo: "Copom — decisão da Selic",
  impacto: "alto",
} as const;

describe("agenda de eventos de mercado", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cria, lista por período (inclusivo) e remove, com auditoria", async () => {
    const e = await c.banco.eventosMercado.criar(c.ana.id, COPOM);
    expect(e).toMatchObject({ ...COPOM, origem: "manual", de: null, ate: null });
    await c.banco.eventosMercado.criar(c.ana.id, { ...COPOM, data: "2026-11-05", titulo: "Payroll (EUA)" });
    const outubro = await c.banco.eventosMercado.listar(c.ana.id, "2026-10-01", "2026-10-28");
    expect(outubro.map((x) => x.titulo)).toEqual(["Copom — decisão da Selic"]);
    expect(await c.banco.eventosMercado.listar(c.ana.id, "2026-10-01", "2026-11-30")).toHaveLength(2);
    expect(await c.banco.eventosMercado.remover(c.ana.id, e.id)).toBe(true);
    expect(await c.banco.eventosMercado.remover(c.ana.id, e.id)).toBe(false);
    const trilha = await c.banco.conexao.sql.unsafe(
      "select acao from auditoria where usuario_id = '" +
        c.ana.id +
        "' and acao like 'evento_mercado%' order by sequencia",
    );
    expect(trilha.map((l) => l.acao)).toEqual([
      "evento_mercado_criado",
      "evento_mercado_criado",
      "evento_mercado_removido",
    ]);
  });

  it("o mesmo evento duas vezes dá conflito legível", async () => {
    await c.banco.eventosMercado.criar(c.ana.id, { ...COPOM, titulo: "IPCA" });
    await expect(c.banco.eventosMercado.criar(c.ana.id, { ...COPOM, titulo: "IPCA" })).rejects.toMatchObject({
      codigo: "conflito",
    });
  });

  it("RLS: uma pessoa não vê, não remove nem confirma o evento da outra", async () => {
    const e = await c.banco.eventosMercado.criar(c.ana.id, { ...COPOM, titulo: "Evento da Ana" });
    expect(await c.banco.eventosMercado.listar(c.beto.id, "2026-01-01", "2026-12-31")).toEqual([]);
    expect(await c.banco.eventosMercado.remover(c.beto.id, e.id)).toBe(false);
    expect(await c.banco.eventosMercado.confirmar(c.beto.id, e.id)).toBeNull();
    // e o banco recusa gravar em nome de outra pessoa
    await expect(
      comoUsuario(c.banco.conexao.db, c.beto.id, (tx) =>
        tx.execute(
          sql`insert into eventos_mercado (usuario_id, data, mercado, titulo, impacto) values (${c.ana.id}, '2026-12-01', 'win', 'x', 'alto')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("sugeridos entram como 'sugerido', sem duplicar, e a pessoa confirma", async () => {
    const lote = [
      { ...COPOM, titulo: "CPI (EUA)", data: "2026-11-11" },
      { ...COPOM, titulo: "CPI (EUA)", data: "2026-11-11" },
    ];
    const novos = await c.banco.eventosMercado.criarSugeridos(c.ana.id, lote);
    expect(novos).toHaveLength(1);
    expect(novos[0]).toMatchObject({ origem: "sugerido" });
    expect(await c.banco.eventosMercado.criarSugeridos(c.ana.id, lote)).toHaveLength(0);
    const confirmado = await c.banco.eventosMercado.confirmar(c.ana.id, novos[0]!.id);
    expect(confirmado?.origem).toBe("manual");
  });

  it("o banco recusa janela incoerente e título em branco", async () => {
    await expect(
      c.banco.eventosMercado.criar(c.ana.id, { ...COPOM, titulo: "Janela ruim", de: "15:00", ate: "14:00" }),
    ).rejects.toThrow();
    await expect(c.banco.eventosMercado.criar(c.ana.id, { ...COPOM, titulo: "   " })).rejects.toThrow();
  });

  it("a porta do motor lê o dia da dona do robô (e só dela)", async () => {
    await c.banco.eventosMercado.criar(c.ana.id, {
      ...COPOM,
      data: "2026-12-09",
      titulo: "Copom dezembro",
      de: "18:00",
      ate: "19:00",
    });
    const porta = portaAgendaEventos(c.banco.conexao.db);
    const doDia = await porta.doDia(c.ana.robo.id, "2026-12-09");
    expect(doDia).toEqual([
      {
        data: "2026-12-09",
        mercado: "win",
        titulo: "Copom dezembro",
        impacto: "alto",
        de: "18:00",
        ate: "19:00",
      },
    ]);
    expect(await porta.doDia(c.beto.robo.id, "2026-12-09")).toEqual([]);
    await expect(porta.doDia("00000000-0000-4000-8000-000000000000", "2026-12-09")).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
  });

  it("o robô guarda o modo de dias de evento (padrão ignorar) e a edição vale", async () => {
    expect(c.ana.robo.limites.diasDeEvento).toBe("ignorar");
    const r = await c.banco.robos.atualizar(c.ana.id, c.ana.robo.id, {
      limites: { ...LIMITES, diasDeEvento: "reduzir" },
    });
    expect(r?.limites.diasDeEvento).toBe("reduzir");
    const config = (await c.banco.portas.robos.ativos()).find((x) => x.id === c.ana.robo.id);
    expect(config?.limites.diasDeEvento).toBe("reduzir");
  });
});
