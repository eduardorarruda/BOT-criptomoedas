import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarHistoricoPostgres } from "./historico.js";

const URL =
  process.env["ZT_TESTE_DATABASE_URL"] ?? "postgres://zentrade:zentrade@127.0.0.1:55441/zentrade_teste";
const sql = postgres(URL, { max: 2, onnotice: () => {} });

beforeAll(async () => {
  await sql.unsafe(`
    drop table if exists avaliacoes_decisao;
    drop table if exists decisoes;
    drop table if exists robos;
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
       '{"acao":"VENDER","explicacao":"alvo"}', null, 61000, 'executada', null, null),
      ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', '2026-09-30T10:00Z',
       '{"acao":"COMPRAR","explicacao":"rompeu"}', '{"acao":"aguardar","confianca":0.7}', 58000, 'registrada',
       null, null);
    -- Mesmas colunas que packages/banco/src/esquema/placar.ts (e o símbolo do robô).
    create table robos (id uuid primary key, simbolo text not null);
    insert into robos values ('11111111-0000-4000-8000-000000000001', 'BTCUSDT'),
      ('22222222-0000-4000-8000-000000000002', 'ETHUSDT');
    create table avaliacoes_decisao (
      decisao_id uuid primary key, claude text not null, confianca numeric(38,18) not null, fonte text not null,
      situacao text not null, resultado numeric(38,18), retorno numeric(38,18), moeda text not null
    );
    insert into avaliacoes_decisao values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'aprovou', 0.8, 'real', 'concluida', 3.21, 0.0000544, 'USDT'),
      ('aaaaaaaa-0000-4000-8000-000000000004', 'vetou', 0.7, 'contrafactual', 'concluida', -12.5, -0.012, 'USDT');
  `);
});
afterAll(async () => {
  await sql`drop table if exists avaliacoes_decisao`;
  await sql`drop table if exists decisoes`;
  await sql`drop table if exists robos`;
  await sql.end();
});

describe("histórico de decisões em SQL", () => {
  it("traz as decisões do robô, mais recentes primeiro, com decimais exatos", async () => {
    const lista = await criarHistoricoPostgres(sql).recentes("11111111-0000-4000-8000-000000000001", 10);
    expect(lista.map((d) => d.id)).toEqual([
      "aaaaaaaa-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000001",
      "aaaaaaaa-0000-4000-8000-000000000004",
    ]);
    expect(lista[1]).toMatchObject({
      sinal: "COMPRAR",
      acaoProposta: "comprar",
      estado: "executada",
      explicacao: "abaixo da média",
    });
    expect(lista[1]!.preco.toFixed()).toBe("59000.123");
    expect(lista[1]!.resultado?.toFixed()).toBe("3.21");
    expect(lista[0]).toMatchObject({ acaoProposta: null, resultado: null, avaliacao: null });
    expect(lista[1]!.avaliacao).toMatchObject({ claude: "aprovou", fonte: "real", acertou: true });
    expect(lista[2]!.avaliacao).toMatchObject({ claude: "vetou", situacao: "concluida", acertou: true });
    expect(lista[2]!.avaliacao?.resultado?.toFixed()).toBe("-12.5");
    expect(lista[1]!.em).toBe(Date.parse("2026-10-01T10:00Z"));
  });

  it("placar: só as entradas com proposta do robô, com o veredito e o resultado", async () => {
    const lista = await criarHistoricoPostgres(sql).placar!("11111111-0000-4000-8000-000000000001", 50);
    expect(lista.map((d) => [d.id.slice(-1), d.claude, d.confianca, d.resultado?.toFixed()])).toEqual([
      ["1", "aprovou", 0.8, "3.21"],
      ["4", "vetou", 0.7, "-12.5"],
    ]);
    expect(lista[0]).toMatchObject({ mercado: "cripto", moeda: "USDT", fonte: "real" });
  });

  it("respeita o limite", async () => {
    await expect(
      criarHistoricoPostgres(sql).recentes("11111111-0000-4000-8000-000000000001", 1),
    ).resolves.toHaveLength(1);
  });
});
