import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarHistoricoPostgres } from "./historico.js";

const URL =
  process.env["ZT_TESTE_DATABASE_URL"] ?? "postgres://zentrade:zentrade@127.0.0.1:55441/zentrade_teste";
const sql = postgres(URL, { max: 2, onnotice: () => {} });

beforeAll(async () => {
  await sql.unsafe(`
    drop table if exists decisoes;
    -- Mesmas colunas (e tipos) que packages/banco/src/esquema/operacao.ts usa.
    create table decisoes (
      id uuid primary key, robo_id uuid not null, em timestamptz not null, sinal jsonb not null,
      proposta jsonb, preco numeric(38,18) not null, estado text not null,
      resultado numeric(38,18), avaliada_em timestamptz
    );
    insert into decisoes values
      ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', '2026-10-01T10:00Z',
       '{"acao":"COMPRAR","explicacao":"abaixo da média"}', '{"acao":"comprar"}', 59000.123, 'executada',
       3.21, '2026-10-01T12:00Z'),
      ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', '2026-10-02T10:00Z',
       '{"acao":"AGUARDAR","explicacao":"nada"}', null, 60000, 'registrada', null, null),
      ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', '2026-10-03T10:00Z',
       '{"acao":"VENDER","explicacao":"alvo"}', null, 61000, 'executada', null, null);
  `);
});
afterAll(async () => {
  await sql`drop table if exists decisoes`;
  await sql.end();
});

describe("histórico de decisões em SQL", () => {
  it("traz as decisões do robô, mais recentes primeiro, com decimais exatos", async () => {
    const lista = await criarHistoricoPostgres(sql).recentes("11111111-0000-4000-8000-000000000001", 10);
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
    await expect(
      criarHistoricoPostgres(sql).recentes("11111111-0000-4000-8000-000000000001", 1),
    ).resolves.toHaveLength(1);
  });
});
