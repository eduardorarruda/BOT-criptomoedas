import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarHistoricoPostgres } from "./historico.js";

const URL =
  process.env["ZT_TESTE_DATABASE_URL"] ?? "postgres://zentrade:zentrade@127.0.0.1:55441/zentrade_teste";
const sql = postgres(URL, { max: 2, onnotice: () => {} });

beforeAll(async () => {
  await sql.unsafe(`
    drop table if exists decisoes;
    create table decisoes (
      id uuid primary key, robo_id text not null, em timestamptz not null, sinal jsonb not null,
      proposta jsonb, preco numeric not null, estado text not null, desfecho jsonb
    );
    insert into decisoes values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'robo-1', '2026-10-01T10:00Z',
       '{"acao":"COMPRAR","explicacao":"abaixo da média"}', '{"acao":"comprar"}', 59000.123, 'executada',
       '{"resultado":"3.21","avaliadoEm":1}'),
      ('aaaaaaaa-0000-4000-8000-000000000002', 'robo-1', '2026-10-02T10:00Z',
       '{"acao":"AGUARDAR","explicacao":"nada"}', null, 60000, 'registrada', null),
      ('aaaaaaaa-0000-4000-8000-000000000003', 'robo-2', '2026-10-03T10:00Z',
       '{"acao":"VENDER","explicacao":"alvo"}', null, 61000, 'executada', null);
  `);
});
afterAll(async () => {
  await sql`drop table if exists decisoes`;
  await sql.end();
});

describe("histórico de decisões em SQL", () => {
  it("traz as decisões do robô, mais recentes primeiro, com decimais exatos", async () => {
    const lista = await criarHistoricoPostgres(sql).recentes("robo-1", 10);
    expect(lista.map((d) => d.id)).toEqual([
      "aaaaaaaa-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000001",
    ]);
    expect(lista[1]).toMatchObject({
      sinal: "COMPRAR",
      acaoProposta: "comprar",
      estado: "executada",
      explicacao: "abaixo da média",
    });
    expect(lista[1]!.preco.toFixed()).toBe("59000.123");
    expect(lista[1]!.resultado?.toFixed()).toBe("3.21");
    expect(lista[0]).toMatchObject({ acaoProposta: null, resultado: null });
    expect(lista[1]!.em).toBe(Date.parse("2026-10-01T10:00Z"));
  });

  it("respeita o limite", async () => {
    await expect(criarHistoricoPostgres(sql).recentes("robo-1", 1)).resolves.toHaveLength(1);
  });
});
