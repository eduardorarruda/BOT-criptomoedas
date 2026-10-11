import { describe, expect, it, vi } from "vitest";
import { criarBuscaHibrida } from "./busca.js";
import { criarEmbeddingsDeterministicos } from "./embeddings/deterministicos.js";
import type { RepositorioConhecimento, TrechoEncontradoBruto } from "./tipos.js";

const USUARIO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const agora = new Date("2026-10-10T00:00:00Z");

const trecho = (
  id: string,
  fonte: TrechoEncontradoBruto["fonte"],
  publicadoEm = agora,
): TrechoEncontradoBruto => ({
  trechoId: id,
  documentoId: `doc-${id}`,
  fonte,
  titulo: `Título ${id}`,
  url: null,
  publicadoEm,
  texto: `texto ${id}`,
});

function repo(vetorial: TrechoEncontradoBruto[], textual: TrechoEncontradoBruto[]): RepositorioConhecimento {
  return {
    documentoPorHash: vi.fn(),
    gravarDocumento: vi.fn(),
    buscarVetorial: vi.fn(async () => vetorial),
    buscarTextual: vi.fn(async () => textual),
  };
}

describe("busca híbrida", () => {
  it("funde vetorial e textual e devolve o necessário para citar", async () => {
    const r = repo([trecho("a", "diario"), trecho("b", "nota")], [trecho("b", "nota")]);
    const busca = criarBuscaHibrida({
      repositorio: r,
      embeddings: criarEmbeddingsDeterministicos(),
      agora: () => agora,
    });
    const achados = await busca.buscar("taxa de saque", { usuarioId: USUARIO, limite: 5 });
    expect(achados.map((a) => a.trechoId)).toEqual(["b", "a"]);
    expect(achados[0]).toMatchObject({
      documentoId: "doc-b",
      fonte: "nota",
      titulo: "Título b",
      texto: "texto b",
    });
    expect(achados[0]!.pontuacao).toBeGreaterThan(0);
  });

  it("filtra por usuário e por fontes, e usa embedding de consulta", async () => {
    const r = repo([], []);
    const embeddings = criarEmbeddingsDeterministicos();
    const gerar = vi.spyOn(embeddings, "gerar");
    const busca = criarBuscaHibrida({ repositorio: r, embeddings });
    await busca.buscar("regras de saque", { usuarioId: USUARIO, fontes: ["regra_corretora"] });
    expect(gerar).toHaveBeenCalledWith(["regras de saque"], "consulta");
    const [filtroV] = vi.mocked(r.buscarVetorial).mock.calls[0]!;
    expect(filtroV).toMatchObject({ usuarioId: USUARIO, fontes: ["regra_corretora"] });
    const [filtroT, termos] = vi.mocked(r.buscarTextual).mock.calls[0]!;
    expect(filtroT.usuarioId).toBe(USUARIO);
    expect(termos).toBe("regras | saque");
  });

  it("pula a busca textual quando a consulta não tem palavra útil", async () => {
    const r = repo([trecho("a", "nota")], []);
    const busca = criarBuscaHibrida({ repositorio: r, embeddings: criarEmbeddingsDeterministicos() });
    await expect(busca.buscar("é ?", { usuarioId: USUARIO })).resolves.toHaveLength(1);
    expect(r.buscarTextual).not.toHaveBeenCalled();
  });

  it("notícia antiga cai para trás de diário igualmente bem colocado", async () => {
    const velha = new Date(agora.getTime() - 30 * 86_400_000);
    const r = repo([trecho("n", "noticia", velha), trecho("d", "diario", velha)], []);
    const busca = criarBuscaHibrida({
      repositorio: r,
      embeddings: criarEmbeddingsDeterministicos(),
      agora: () => agora,
    });
    const achados = await busca.buscar("btc", { usuarioId: USUARIO });
    expect(achados.map((a) => a.trechoId)).toEqual(["d", "n"]);
  });

  it("valida a consulta e o usuário na borda", async () => {
    const busca = criarBuscaHibrida({
      repositorio: repo([], []),
      embeddings: criarEmbeddingsDeterministicos(),
    });
    await expect(busca.buscar("", { usuarioId: USUARIO })).rejects.toThrow(/consulta/);
    await expect(busca.buscar("ok", { usuarioId: "nao-uuid" })).rejects.toThrow(/usuarioId/);
    await expect(busca.buscar("ok", { usuarioId: USUARIO, limite: 0 })).rejects.toThrow(/limite/);
  });
});
