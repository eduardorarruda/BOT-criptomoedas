import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarServicoArquivos } from "../integracoes/conhecimento-arquivos.js";
import { repositorioRag } from "../integracoes/conhecimento.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

// EMBEDDINGS_PROVEDOR=nenhum: a base funciona sem chave nenhuma, com busca só por palavras.
describe("conhecimento sem embeddings (só palavras)", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;

  beforeAll(async () => {
    api = await montarApi({
      embeddings: null,
      extras: (banco, conhecimento) => ({
        arquivos: criarServicoArquivos({
          conhecimento,
          banco,
          repositorio: repositorioRag(banco),
          embeddings: { embeddings: null },
          agora: () => Date.UTC(2026, 9, 10),
        }),
      }),
    });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  const pedir = (p: Pessoa, method: "GET" | "POST", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  it("a nota entra sem vetor e a busca acha sem acento, marcada como só palavras", async () => {
    const nota = await pedir(ana, "POST", "/conhecimento/notas", {
      titulo: "Bolsa",
      texto: "Comprei ações da Petrobras e vendi o mini índice na abertura.",
    });
    expect(nota.statusCode).toBe(201);
    const [linha] = await api.banco.conexao
      .sql`select count(*)::int as n from trechos where embedding is null and usuario_id = ${ana.id}`;
    expect(linha!.n).toBe(1);

    const busca = await pedir(ana, "GET", "/conhecimento/busca?q=acoes%20mini%20indice");
    expect(busca.statusCode).toBe(200);
    expect(busca.json()).toEqual([expect.objectContaining({ titulo: "Bolsa", modo: "palavras" })]);
    expect((await pedir(beto, "GET", "/conhecimento/busca?q=acoes")).json()).toEqual([]);
  });

  it("o estado e a saúde dizem que a busca é só por palavras e quantos trechos esperam vetor", async () => {
    expect((await pedir(ana, "GET", "/conhecimento/estado")).json()).toEqual({
      busca: "palavras",
      trechosSemVetor: 1,
      motivo: null,
    });
    expect((await pedir(beto, "GET", "/conhecimento/estado")).json()).toMatchObject({ trechosSemVetor: 0 });
    const saude = await api.app.inject({ method: "GET", url: "/api/v1/saude" });
    expect(saude.json()).toMatchObject({ ok: true, conhecimento: "palavras" });
    expect((await api.app.inject({ method: "GET", url: "/api/v1/conhecimento/estado" })).statusCode).toBe(
      401,
    );
  });
});
