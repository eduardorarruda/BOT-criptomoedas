import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";
import { repositorioReplay } from "../repositorios/replay.js";

const base = {
  execucao: "p1-teste",
  simbolo: "BTCUSDT",
  sinalEm: Date.parse("2026-07-02T10:00:00Z"),
  preco: dec("60000.5"),
  sinal: { acao: "COMPRAR" },
  proposta: { acao: "comprar", confianca: 0.7 },
  veredito: "aprovou",
  custoIaUsd: dec("0.4"),
} as const;

describe("replay histórico: armazém próprio", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("grava sem duplicar, lista em ordem cronológica e soma o custo", async () => {
    const r = repositorioReplay(c.banco.conexao.db);
    await r.gravar(base);
    await r.gravar(base); // a mesma análise de novo não duplica nem cobra duas vezes
    await r.gravar({ ...base, sinalEm: base.sinalEm - 3_600_000, veredito: "vetou", custoIaUsd: dec("0.1") });
    await r.gravar({ ...base, execucao: "outra" });
    const lista = await r.listar("p1-teste");
    expect(lista.map((a) => a.veredito)).toEqual(["vetou", "aprovou"]);
    expect(lista[1]?.preco.toString()).toBe("60000.5");
    expect(lista[1]?.proposta).toEqual(base.proposta);
    expect((await r.custoTotal("p1-teste")).toString()).toBe("0.5");
    expect((await r.custoTotal("nenhuma")).toString()).toBe("0");
  });

  it("o custo médio de análise vem do livro de gastos, ou null se vazio", async () => {
    const r = repositorioReplay(c.banco.conexao.db);
    expect(await r.custoMedioDeAnalise()).toBeNull();
    await c.banco.conexao.sql.unsafe(
      `insert into gastos_ia (usuario_id, origem, custo_usd) values ('${c.ana.id}', 'analise', 0.2), ('${c.ana.id}', 'analise', 0.4), ('${c.ana.id}', 'assistente', 9)`,
    );
    expect((await r.custoMedioDeAnalise())?.toString()).toBe("0.3");
  });

  it("a aplicação (zentrade_app) não enxerga o replay e o banco rejeita veredito inválido", async () => {
    const r = repositorioReplay(c.banco.conexao.db);
    await expect(r.gravar({ ...base, simbolo: "ETHUSDT", veredito: "talvez" as never })).rejects.toThrow();
    const concedido = await c.banco.conexao.sql.unsafe(
      `select has_table_privilege('zentrade_app', 'replay_analises', 'SELECT') as ok`,
    );
    expect(concedido[0]?.["ok"]).toBe(false);
  });
});
