import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDescartavel, type BancoDescartavel } from "./teste/index.js";
import { migrar } from "./migrar.js";

describe("migrações aplicadas do zero", () => {
  let banco: BancoDescartavel;
  let sql: postgres.Sql;

  beforeAll(async () => {
    banco = await criarBancoDescartavel();
    sql = postgres(banco.url, { max: 1, onnotice: () => undefined });
  });
  afterAll(async () => {
    await sql.end();
    await banco.descartar();
  });

  it("cria as tabelas, a hypertable e os agregados contínuos", async () => {
    const tabelas = await sql`select tablename from pg_tables where schemaname = 'public' order by 1`;
    expect(tabelas.map((t) => t.tablename)).toEqual(
      expect.arrayContaining(["usuarios", "robos", "decisoes", "ordens", "execucoes", "candles", "trechos"]),
    );
    const [hyper] =
      await sql`select count(*)::int as n from timescaledb_information.hypertables where hypertable_name = 'candles'`;
    expect(hyper!.n).toBe(1);
    const caggs = await sql`select view_name from timescaledb_information.continuous_aggregates order by 1`;
    expect(caggs.map((c) => c.view_name)).toEqual(["candles_1h", "candles_5m"]);
  });

  it("liga RLS nas tabelas de dados e cria os índices hnsw e gin", async () => {
    const semRls = await sql`
      select relname from pg_class
      where relname in ('robos', 'decisoes', 'ordens', 'execucoes', 'protecoes_corretora', 'contas_corretora', 'documentos', 'trechos')
        and not relrowsecurity`;
    expect(semRls).toHaveLength(0);
    const indices = await sql`select indexname from pg_indexes where tablename = 'trechos'`;
    expect(indices.map((i) => i.indexname)).toEqual(
      expect.arrayContaining(["trechos_embedding_hnsw", "trechos_busca_gin"]),
    );
  });

  it("0012: trecho sem vetor, busca em português sem acento e índices da busca e da reindexação", async () => {
    const [coluna] = await sql`
      select is_nullable from information_schema.columns
      where table_name = 'trechos' and column_name = 'embedding'`;
    expect(coluna!.is_nullable).toBe("YES");
    const [lexemas] = await sql`select to_tsvector('zentrade_pt', 'Ações do mini índice')::text as v`;
    expect(lexemas!.v).toBe("'aco':1 'indic':4 'min':3");
    const indices = await sql`
      select indexname from pg_indexes where tablename in ('trechos', 'documentos')`;
    expect(indices.map((i) => i.indexname)).toEqual(
      expect.arrayContaining(["trechos_busca_gin", "documentos_busca_gin", "trechos_sem_vetor"]),
    );
  });

  it("rodar de novo não faz nada (idempotente)", async () => {
    await expect(migrar(banco.url)).resolves.toBeUndefined();
  });
});
