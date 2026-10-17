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

describe("sem embeddings (EMBEDDINGS_PROVEDOR=nenhum) e corpus misto", () => {
  it("grava os trechos sem vetor e acha pelas palavras, no modo palavras", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    const r = await ingerir(doc(ANA, "O mini índice fecha às 18h25 na B3.", { titulo: "Pregão" }), {
      repositorio,
      embeddings: null,
    });
    expect(r).toMatchObject({ novo: true, trechos: 1 });
    const [linha] = await sql<
      { sem: number }[]
    >`select count(*)::int as sem from trechos where embedding is null`;
    expect(linha?.sem).toBe(1);

    const busca = criarBuscaHibrida({ repositorio, embeddings: null });
    expect(busca.modo).toBe("palavras");
    const achados = await busca.buscar("mini indice", { usuarioId: ANA });
    expect(achados.map((a) => a.titulo)).toEqual(["Pregão"]);
    expect(await busca.buscar("mini indice", { usuarioId: BETO })).toEqual([]);
  });

  it("com vetores e sem vetores misturados, a busca híbrida acha os dois e a vetorial ignora os sem vetor", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    await ingerir(doc(ANA, "Stop móvel protege o lucro da operação.", { titulo: "Com vetor" }), {
      repositorio,
      embeddings,
    });
    await ingerir(doc(ANA, "Stop no fundo anterior para operações de swing.", { titulo: "Sem vetor" }), {
      repositorio,
      embeddings: null,
    });
    const [vetor] = await embeddings.gerar(["stop"], "consulta");
    const filtro = { usuarioId: ANA, fontes: null, limite: 10 };
    expect((await repositorio.buscarVetorial(filtro, vetor!)).map((t) => t.titulo)).toEqual(["Com vetor"]);

    const busca = criarBuscaHibrida({ repositorio, embeddings });
    const titulos = (await busca.buscar("stop operações", { usuarioId: ANA })).map((a) => a.titulo);
    expect(titulos.sort()).toEqual(["Com vetor", "Sem vetor"]);
  });
});

describe("busca por palavras em português", () => {
  const textos = {
    acoes: "Comprei ações da Petrobras na baixa.",
    acao: "Cada ação do índice tem um peso.",
    indice: "O mini índice abriu em alta e o dólar caiu.",
    operacao: "Toda operação precisa de um stop definido.",
    regras: "As regras da corretora mudaram em outubro.",
  } as const;

  async function semear() {
    const repositorio = criarRepositorioPostgres(sql);
    for (const [titulo, texto] of Object.entries(textos)) {
      await ingerir(doc(ANA, texto, { titulo }), { repositorio, embeddings: null });
    }
    return criarBuscaHibrida({ repositorio, embeddings: null });
  }
  const titulos = async (busca: Awaited<ReturnType<typeof semear>>, consulta: string) =>
    (await busca.buscar(consulta, { usuarioId: ANA, limite: 10 })).map((a) => a.titulo).sort();

  it("ignora acento nos dois sentidos: acoes acha ações, mini indice acha mini índice", async () => {
    const busca = await semear();
    expect(await titulos(busca, "acoes")).toEqual(["acao", "acoes"]);
    expect(await titulos(busca, "ações")).toEqual(["acao", "acoes"]);
    expect(await titulos(busca, "mini indice")).toEqual(["acao", "indice"]);
    expect(await titulos(busca, "mini índice")).toEqual(["acao", "indice"]);
  });

  it("junta singular e plural: operações acha operação, regra acha regras", async () => {
    const busca = await semear();
    expect(await titulos(busca, "operações")).toEqual(["operacao"]);
    expect(await titulos(busca, "operacoes")).toEqual(["operacao"]);
    expect(await titulos(busca, "regra")).toEqual(["regras"]);
  });

  it("o título do documento também conta, com peso menor que o texto", async () => {
    const repositorio = criarRepositorioPostgres(sql);
    await ingerir(doc(ANA, "Abre às 9h e fecha às 18h.", { titulo: "Horário do mini índice" }), {
      repositorio,
      embeddings: null,
    });
    await ingerir(doc(ANA, "O mini índice tem tick de 5 pontos.", { titulo: "Ticks" }), {
      repositorio,
      embeddings: null,
    });
    const busca = criarBuscaHibrida({ repositorio, embeddings: null });
    const achados = await busca.buscar("mini indice", { usuarioId: ANA });
    expect(achados.map((a) => a.titulo)).toEqual(["Ticks", "Horário do mini índice"]);
  });

  it("consulta só com palavras vazias não quebra nem devolve lixo", async () => {
    const busca = await semear();
    expect(await titulos(busca, "estava sendo")).toEqual([]);
  });
});
