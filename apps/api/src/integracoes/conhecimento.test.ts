import type { Banco } from "@zentrade/banco";
import { ErroEmbeddings, type Embeddings, type RepositorioConhecimento } from "@zentrade/conhecimento";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../erros.js";
import { criarServicoConhecimento, prepararEmbeddings, repositorioRag } from "./conhecimento.js";

const USUARIO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const embeddings: Embeddings = {
  dimensoes: 1024,
  gerar: async (textos) => textos.map(() => Array.from({ length: 1024 }, () => 0.1)),
};

function repositorioFalso(existente: string | null = null) {
  const gravados: { doc: { id: string; hashConteudo: string }; trechos: { texto: string }[] }[] = [];
  const repositorio = {
    documentoPorHash: vi.fn(async () => existente),
    gravarDocumento: vi.fn(
      async (doc: { id: string; hashConteudo: string }, trechos: { texto: string }[]) => {
        gravados.push({ doc, trechos });
        return { documentoId: doc.id, novo: true };
      },
    ),
    buscarVetorial: vi.fn(),
    buscarTextual: vi.fn(),
  } as unknown as RepositorioConhecimento;
  return { repositorio, gravados };
}

const documentos = {
  obter: vi.fn(async (_u: string, id: string) => ({
    id,
    fonte: "nota" as const,
    titulo: "Fim de semana",
    url: null,
    publicadoEm: 1,
    criadoEm: 2,
  })),
};
const nota = {
  fonte: "nota" as const,
  titulo: "Fim de semana",
  publicadoEm: 1,
  texto: "Liquidez baixa.\n\n",
};

describe("ingestão do RAG pela API", () => {
  it("normaliza, divide, gera embeddings e devolve o documento gravado", async () => {
    const { repositorio, gravados } = repositorioFalso();
    const servico = criarServicoConhecimento({ repositorio, documentos, embeddings: { embeddings } });
    const r = await servico.ingerir(USUARIO, nota);
    expect(r).toMatchObject({ titulo: "Fim de semana", novo: true, trechos: 1, url: null });
    expect(gravados[0]?.trechos.map((t) => t.texto)).toEqual(["Liquidez baixa."]);
    expect(gravados[0]?.doc.hashConteudo).toMatch(/^[0-9a-f]{64}$/);
  });

  it("conteúdo repetido não gera embedding de novo", async () => {
    const { repositorio } = repositorioFalso("doc-existente");
    const gerar = vi.fn(embeddings.gerar);
    const servico = criarServicoConhecimento({
      repositorio,
      documentos,
      embeddings: { embeddings: { ...embeddings, gerar } },
    });
    expect(await servico.ingerir(USUARIO, nota)).toMatchObject({ id: "doc-existente", novo: false });
    expect(gerar).not.toHaveBeenCalled();
  });

  it("RAG desligado responde 503 com o motivo", async () => {
    const servico = criarServicoConhecimento({
      ...repositorioFalso(),
      documentos,
      embeddings: { indisponivel: "VOYAGE_API_KEY não está definida" },
    });
    await expect(servico.ingerir(USUARIO, nota)).rejects.toMatchObject({
      statusCode: 503,
      codigo: "conhecimento_indisponivel",
      message: expect.stringMatching(/VOYAGE_API_KEY/),
    });
  });

  it("documento inválido vira 400; falha do provedor vira 502; o resto passa adiante", async () => {
    const { repositorio } = repositorioFalso();
    const servico = (gerar: Embeddings["gerar"]) =>
      criarServicoConhecimento({
        repositorio,
        documentos,
        embeddings: { embeddings: { ...embeddings, gerar } },
      });
    await expect(servico(embeddings.gerar).ingerir("nao-uuid", nota)).rejects.toMatchObject({
      statusCode: 400,
      codigo: "documento_invalido",
    });
    const caiu = servico(async () => Promise.reject(new ErroEmbeddings("HTTP 401")));
    await expect(caiu.ingerir(USUARIO, nota)).rejects.toMatchObject({ statusCode: 502 });
    const outro = servico(async () => Promise.reject(new Error("inesperado")));
    await expect(outro.ingerir(USUARIO, nota)).rejects.not.toBeInstanceOf(ErroApi);
  });

  it("documento que some depois de gravado é erro interno", async () => {
    const servico = criarServicoConhecimento({
      ...repositorioFalso(),
      documentos: { obter: async () => null },
      embeddings: { embeddings },
    });
    await expect(servico.ingerir(USUARIO, nota)).rejects.toThrow(/sumiu/);
  });
});

describe("configuração dos embeddings", () => {
  it("usa a mesma leitura de ambiente do agente; sem chave, RAG desligado com explicação", () => {
    expect(prepararEmbeddings({ EMBEDDINGS_PROVEDOR: "ollama" })).toHaveProperty("embeddings");
    const sem = prepararEmbeddings({});
    expect(sem).toEqual({ indisponivel: expect.stringMatching(/VOYAGE_API_KEY/) });
  });

  it("erro que não é de configuração sobe", () => {
    expect(() =>
      prepararEmbeddings({}, () => {
        throw new TypeError("bug");
      }),
    ).toThrow(TypeError);
  });
});

describe("porta do RAG sobre o banco", () => {
  it("grava e procura pelo repositório com RLS do banco", async () => {
    const conhecimento = {
      documentoPorHash: vi.fn(async () => "d1"),
      gravarDocumento: vi.fn(async () => ({ documentoId: "d1", novo: true })),
    };
    const banco = { conexao: { sql: vi.fn() }, conhecimento } as unknown as Banco;
    const porta = repositorioRag(banco);
    expect(await porta.documentoPorHash(USUARIO, "h")).toBe("d1");
    const doc = {
      id: "d1",
      usuarioId: USUARIO,
      fonte: "nota" as const,
      titulo: "t",
      url: null,
      publicadoEm: new Date(),
      hashConteudo: "h",
    };
    expect(await porta.gravarDocumento(doc, [])).toEqual({ documentoId: "d1", novo: true });
    expect(conhecimento.gravarDocumento).toHaveBeenCalledWith(doc, []);
    expect(typeof porta.buscarVetorial).toBe("function");
  });
});
