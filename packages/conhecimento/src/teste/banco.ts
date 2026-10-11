import postgres, { type Sql } from "postgres";

/** Banco de teste: PostgreSQL + pgvector do Docker (porta 55441, container zt-intel-*). */
export const URL_BANCO_TESTE =
  process.env["ZT_TESTE_DATABASE_URL"] ?? "postgres://zentrade:zentrade@127.0.0.1:55441/zentrade_teste";

/**
 * As tabelas do RAG exatamente como em docs/contrato-api.md. Quem é dono da migração
 * de verdade é packages/banco; aqui só recriamos para testar contra o mesmo esquema.
 */
export async function criarTabelasRag(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create extension if not exists vector;
    drop table if exists trechos;
    drop table if exists documentos;
    create table documentos (
      id uuid primary key,
      usuario_id uuid not null,
      fonte text not null check (fonte in ('diario','noticia','regra_corretora','estrategia','nota')),
      titulo text not null,
      url text,
      publicado_em timestamptz not null,
      hash_conteudo text not null,
      criado_em timestamptz not null default now(),
      unique (usuario_id, hash_conteudo)
    );
    create table trechos (
      id uuid primary key,
      documento_id uuid not null references documentos on delete cascade,
      usuario_id uuid not null,
      ordem int not null,
      texto text not null,
      embedding vector(1024) not null,
      busca tsvector generated always as (to_tsvector('simple', texto)) stored,
      criado_em timestamptz not null default now()
    );
    create index on trechos using hnsw (embedding vector_cosine_ops);
    create index on trechos using gin (busca);
    create index on trechos (usuario_id, documento_id);
  `);
}

export function conectarBancoTeste(): Sql {
  return postgres(URL_BANCO_TESTE, { max: 4, onnotice: () => {} });
}
