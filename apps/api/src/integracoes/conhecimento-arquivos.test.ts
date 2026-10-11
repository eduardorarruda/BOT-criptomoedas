import {
  ErroConhecimento,
  ErroEmbeddings,
  ErroExtracao,
  type RepositorioConhecimento,
} from "@zentrade/conhecimento";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../erros.js";
import { criarServicoArquivos, nomeSeguro, type DependenciasArquivos } from "./conhecimento-arquivos.js";

const USUARIO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const ingerido = {
  id: "d1",
  fonte: "nota" as const,
  titulo: "t",
  url: null,
  publicadoEm: 1,
  criadoEm: 1,
  novo: true,
  trechos: 1,
};

function deps(extra: Partial<DependenciasArquivos> = {}) {
  const ingerir = vi.fn(async (_u: string, _d: unknown) => ingerido);
  const gravarOrigem = vi.fn(async () => undefined);
  const d: DependenciasArquivos = {
    conhecimento: { ingerir },
    banco: { conhecimentoDetalhe: { gravarOrigem } as never },
    repositorio: {} as RepositorioConhecimento,
    embeddings: { indisponivel: "sem chave" },
    agora: () => 5,
    ...extra,
  };
  return { s: criarServicoArquivos(d), ingerir, gravarOrigem };
}

describe("nomeSeguro", () => {
  it("tira caminho e caracteres de controle e limita o tamanho", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("passwd");
    expect(nomeSeguro("C:\\Users\\x\\relatório.pdf")).toBe("relatório.pdf");
    expect(nomeSeguro("a\u0000b\u001bc.txt")).toBe("abc.txt");
    expect(nomeSeguro("   ")).toBe("arquivo");
    expect(nomeSeguro(`${"x".repeat(300)}.md`)).toHaveLength(255);
  });
});

describe("serviço de arquivos", () => {
  it("arquivo: título do pedido, do próprio arquivo ou do nome; grava a origem só quando é novo", async () => {
    const { s, ingerir, gravarOrigem } = deps();
    await s.ingerirArquivo(USUARIO, { nome: "notas.txt", bytes: Buffer.from("texto"), fonte: "nota" });
    expect(ingerir).toHaveBeenCalledWith(USUARIO, {
      titulo: "notas",
      fonte: "nota",
      publicadoEm: 5,
      texto: "texto",
    });
    expect(gravarOrigem).toHaveBeenCalledWith(USUARIO, "d1", {
      origem: "arquivo",
      nomeArquivo: "notas.txt",
      tipoArquivo: "txt",
      bytes: 5,
    });
    await s.ingerirArquivo(USUARIO, {
      nome: "x.txt",
      bytes: Buffer.from("y"),
      fonte: "nota",
      titulo: "Meu título",
    });
    expect(ingerir.mock.calls[1]![1]).toMatchObject({ titulo: "Meu título" });
    ingerir.mockResolvedValueOnce({ ...ingerido, novo: false });
    gravarOrigem.mockClear();
    const repetido = await s.ingerirArquivo(USUARIO, {
      nome: "x.txt",
      bytes: Buffer.from("y"),
      fonte: "nota",
    });
    expect(repetido).toMatchObject({ novo: false, caracteres: 1, truncado: false });
    expect(gravarOrigem).not.toHaveBeenCalled();
  });

  it("arquivo inválido vira 422; outros erros sobem como estão", async () => {
    const { s } = deps();
    await expect(
      s.ingerirArquivo(USUARIO, { nome: "a.exe", bytes: Buffer.from("x"), fonte: "nota" }),
    ).rejects.toMatchObject({
      statusCode: 422,
      codigo: "arquivo_invalido",
    });
    const falha = new Error("banco caiu");
    const { s: s2 } = deps({ conhecimento: { ingerir: async () => Promise.reject(falha) } });
    await expect(
      s2.ingerirArquivo(USUARIO, { nome: "a.txt", bytes: Buffer.from("x"), fonte: "nota" }),
    ).rejects.toBe(falha);
  });

  it("link: usa o título da página ou o domínio, e a URL final", async () => {
    const lerLink = vi.fn(async () => ({
      url: "https://exemplo.com/fim",
      tipo: "html" as const,
      titulo: null,
      texto: "t",
      caracteres: 1,
      truncado: false,
      bytes: 9,
    }));
    const { s, ingerir, gravarOrigem } = deps({ lerLink });
    await s.ingerirLink(USUARIO, { url: "https://exemplo.com", fonte: "noticia" });
    expect(ingerir).toHaveBeenCalledWith(
      USUARIO,
      expect.objectContaining({ titulo: "exemplo.com", url: "https://exemplo.com/fim", fonte: "noticia" }),
    );
    expect(gravarOrigem).toHaveBeenCalledWith(USUARIO, "d1", {
      origem: "link",
      tipoArquivo: "html",
      bytes: 9,
    });
    const falho = deps({ lerLink: async () => Promise.reject(new ErroExtracao("rede interna")) }).s;
    await expect(falho.ingerirLink(USUARIO, { url: "https://x", fonte: "nota" })).rejects.toMatchObject({
      codigo: "link_invalido",
    });
  });

  it("busca: 503 sem embeddings; erros de consulta e de embeddings traduzidos", async () => {
    await expect(deps().s.buscar(USUARIO, "x", 5)).rejects.toMatchObject({ statusCode: 503 });
    const embeddings = {
      embeddings: {
        dimensoes: 1024 as const,
        gerar: async (t: readonly string[]) => t.map(() => Array(1024).fill(0)),
      },
    };
    const repositorio = {
      buscarVetorial: async () => [
        {
          trechoId: "t",
          documentoId: "d",
          fonte: "nota" as const,
          titulo: "T",
          url: null,
          publicadoEm: new Date("2026-01-01T00:00:00Z"),
          texto: "x",
        },
      ],
      buscarTextual: async () => [],
    } as unknown as RepositorioConhecimento;
    const { s } = deps({ embeddings, repositorio, agora: () => Date.UTC(2026, 0, 2) });
    const [achado] = await s.buscar(USUARIO, "taxa", 5);
    expect(achado).toMatchObject({ documentoId: "d", publicadoEm: Date.UTC(2026, 0, 1) });
    await expect(s.buscar(USUARIO, "   ", 5)).rejects.toBeInstanceOf(ErroApi);
    const quebrado = deps({
      embeddings: {
        embeddings: {
          dimensoes: 1024 as const,
          gerar: async () => Promise.reject(new ErroEmbeddings("voyage caiu")),
        },
      },
      repositorio,
    }).s;
    await expect(quebrado.buscar(USUARIO, "taxa", 5)).rejects.toMatchObject({ statusCode: 502 });
    expect(new ErroConhecimento("x")).toBeInstanceOf(Error);
  });
});
