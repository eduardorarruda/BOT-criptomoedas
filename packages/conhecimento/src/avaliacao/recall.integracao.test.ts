import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBuscaHibrida } from "../busca.js";
import { criarEmbeddingsDeterministicos } from "../embeddings/deterministicos.js";
import { ingerir } from "../ingestao.js";
import { criarRepositorioPostgres } from "../postgres/repositorio.js";
import { conectarBancoTeste, criarTabelasRag } from "../teste/banco.js";
import {
  DOCUMENTOS_AVALIACAO,
  PERGUNTAS_AVALIACAO,
  RECALL_MINIMO,
  RECALL_MINIMO_PALAVRAS,
} from "./fixtures.js";
import { medirRecall } from "./recall.js";

const USUARIO = "66666666-6666-4666-8666-666666666666";
const AGORA = new Date("2026-10-10T12:00:00Z");
const DIA = 86_400_000;

let sql: Sql;

beforeAll(async () => {
  sql = conectarBancoTeste();
  await criarTabelasRag(sql);
  const repositorio = criarRepositorioPostgres(sql);
  const embeddings = criarEmbeddingsDeterministicos();
  for (const d of DOCUMENTOS_AVALIACAO) {
    await ingerir(
      {
        usuarioId: USUARIO,
        fonte: d.fonte,
        titulo: d.titulo,
        publicadoEm: new Date(AGORA.getTime() - d.diasAtras * DIA),
        texto: d.texto,
      },
      { repositorio, embeddings },
    );
  }
});
afterAll(async () => sql.end());

describe("avaliação da busca híbrida", () => {
  it(`recall@5 fica em pelo menos ${RECALL_MINIMO}`, async () => {
    const busca = criarBuscaHibrida({
      repositorio: criarRepositorioPostgres(sql),
      embeddings: criarEmbeddingsDeterministicos(),
      agora: () => AGORA,
    });
    const resultado = await medirRecall(
      PERGUNTAS_AVALIACAO,
      async (p) => (await busca.buscar(p, { usuarioId: USUARIO, limite: 5 })).map((t) => t.titulo),
      5,
    );
    // A mensagem mostra as perguntas que falharam e o que veio no lugar.
    expect(resultado.recall, JSON.stringify(resultado.falhas, null, 2)).toBeGreaterThanOrEqual(RECALL_MINIMO);
  });

  it(`só por palavras (sem embeddings), recall@5 fica em pelo menos ${RECALL_MINIMO_PALAVRAS}`, async () => {
    const busca = criarBuscaHibrida({
      repositorio: criarRepositorioPostgres(sql),
      embeddings: null,
      agora: () => AGORA,
    });
    const resultado = await medirRecall(
      PERGUNTAS_AVALIACAO,
      async (p) => (await busca.buscar(p, { usuarioId: USUARIO, limite: 5 })).map((t) => t.titulo),
      5,
    );
    expect(resultado.recall, JSON.stringify(resultado.falhas, null, 2)).toBeGreaterThanOrEqual(
      RECALL_MINIMO_PALAVRAS,
    );
  });
});
