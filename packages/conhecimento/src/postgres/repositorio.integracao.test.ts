import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarBuscaHibrida } from "../busca.js";
import { criarEmbeddingsDeterministicos } from "../embeddings/deterministicos.js";
import { detectarTipo } from "../extracao/detectar.js";
import { extrairTexto } from "../extracao/extrair.js";
import { ingerir } from "../ingestao.js";
import { pdfComTexto } from "../teste/arquivos.js";
import { conectarBancoTeste, criarTabelasRag } from "../teste/banco.js";
import { criarRepositorioPostgres } from "./repositorio.js";

const ANA = "11111111-1111-4111-8111-111111111111";
const BETO = "22222222-2222-4222-8222-222222222222";

let sql: Sql;
const embeddings = criarEmbeddingsDeterministicos();

beforeAll(async () => {
  sql = conectarBancoTeste();
  await criarTabelasRag(sql);
});
afterAll(async () => sql.end());
beforeEach(async () => {
  await sql`truncate documentos cascade`;
});

const doc = (usuarioId: string, texto: string, extra: Partial<Parameters<typeof ingerir>[0]> = {}) => ({
  usuarioId,
  fonte: "nota" as const,
  titulo: "Nota",
  publicadoEm: new Date("2026-10-01T00:00:00Z"),
  texto,
  ...extra,
});

describe("repositório PostgreSQL + pgvector", () => {
  it("grava documento e trechos e não duplica o mesmo conteúdo", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    const deps = { repositorio, embeddings, divisor: { tamanhoMaximo: 60, sobreposicao: 0 } };
    const texto = "Primeiro parágrafo sobre taxas.\n\nSegundo parágrafo sobre saques mínimos.";
    const primeiro = await ingerir(doc(ANA, texto), deps);
    const segundo = await ingerir(doc(ANA, `  ${texto}\r\n`), deps);
    expect(primeiro).toMatchObject({ novo: true, trechos: 2 });
    expect(segundo).toEqual({ documentoId: primeiro.documentoId, novo: false, trechos: 0 });
    const [contagem] = await sql<{ n: number }[]>`select count(*)::int as n from trechos`;
    expect(contagem?.n).toBe(2);
  });

  it("o mesmo texto de outro usuário é outro documento", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    const a = await ingerir(doc(ANA, "texto igual"), { repositorio, embeddings });
    const b = await ingerir(doc(BETO, "texto igual"), { repositorio, embeddings });
    expect(a.documentoId).not.toBe(b.documentoId);
    expect(b.novo).toBe(true);
  });

  it("corrida: gravar duas vezes o mesmo hash devolve o documento que já existe", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    const base = {
      usuarioId: ANA,
      fonte: "nota" as const,
      titulo: "x",
      url: null,
      publicadoEm: new Date(),
      hashConteudo: "h1",
    };
    const t = {
      id: "33333333-3333-4333-8333-333333333333",
      ordem: 0,
      texto: "x",
      embedding: new Array(1024).fill(0.1),
    };
    const r1 = await repositorio.gravarDocumento({ ...base, id: "44444444-4444-4444-8444-444444444444" }, [
      t,
    ]);
    const r2 = await repositorio.gravarDocumento({ ...base, id: "55555555-5555-4555-8555-555555555555" }, []);
    expect(r1.novo).toBe(true);
    expect(r2).toEqual({ documentoId: r1.documentoId, novo: false });
  });

  it("busca híbrida filtra por usuário e por fonte e devolve dados para citar", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    await ingerir(
      doc(ANA, "A taxa de saque de USDT na rede TRC20 é 1 USDT.", {
        fonte: "regra_corretora",
        titulo: "Saques",
      }),
      {
        repositorio,
        embeddings,
      },
    );
    await ingerir(
      doc(ANA, "Comprei BTC abaixo da média e o stop foi atingido.", {
        fonte: "diario",
        titulo: "Decisão 12",
      }),
      {
        repositorio,
        embeddings,
      },
    );
    await ingerir(doc(BETO, "A taxa de saque de USDT é segredo do Beto.", { titulo: "Do Beto" }), {
      repositorio,
      embeddings,
    });

    const busca = criarBuscaHibrida({ repositorio, embeddings });
    const achados = await busca.buscar("taxa de saque USDT", { usuarioId: ANA, limite: 5 });
    expect(achados[0]).toMatchObject({ fonte: "regra_corretora", titulo: "Saques" });
    expect(achados[0]!.publicadoEm).toBeInstanceOf(Date);
    expect(achados.every((a) => a.titulo !== "Do Beto")).toBe(true);

    const soDiario = await busca.buscar("taxa de saque USDT", { usuarioId: ANA, fontes: ["diario"] });
    expect(soDiario.map((a) => a.fonte)).toEqual(["diario"]);
  });

  it("apagar o documento apaga os trechos (on delete cascade)", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    const r = await ingerir(doc(ANA, "algo"), { repositorio, embeddings });
    await sql`delete from documentos where id = ${r.documentoId}`;
    const [contagem] = await sql<{ n: number }[]>`select count(*)::int as n from trechos`;
    expect(contagem?.n).toBe(0);
  });

  it("arquivo enviado por uma pessoa entra só no RAG dela, nem com a busca idêntica a outra o vê", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    const pdf = pdfComTexto(["Plano secreto: comprar ETH so abaixo de 2000 USDT"]);
    const extraido = await extrairTexto(pdf, detectarTipo("plano.pdf", pdf));
    await ingerir(doc(ANA, extraido.texto, { titulo: "plano.pdf" }), { repositorio, embeddings });
    const busca = criarBuscaHibrida({ repositorio, embeddings });
    const daAna = await busca.buscar("plano secreto comprar ETH", { usuarioId: ANA });
    expect(daAna.map((a) => a.titulo)).toEqual(["plano.pdf"]);
    expect(daAna[0]!.texto).toContain("[Página 1]");
    expect(await busca.buscar(extraido.texto, { usuarioId: BETO, limite: 50 })).toEqual([]);
  });
});
