import { customType, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Dinheiro, preço e quantidade: NUMERIC(38,18), nunca float. O driver devolve
 * texto e o código converte com dec() do domínio.
 */
export const decimal = (nome: string) => numeric(nome, { precision: 38, scale: 18 });

/** Instantes sempre com fuso (timestamptz); a API converte para milissegundos UTC. */
export const instante = (nome: string) => timestamp(nome, { withTimezone: true, mode: "date" });

/** Coluna tsvector da busca textual; só leitura (gerada pelo banco). */
export const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});
