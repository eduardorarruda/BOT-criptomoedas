import { ErroExtracao } from "@zentrade/conhecimento";
import { describe, expect, it } from "vitest";
import { extrairIsolado } from "./extracao-isolada.js";

const teste = (nome: string) => new URL(`../teste/${nome}`, import.meta.url);

describe("extração isolada numa worker thread", () => {
  it("o erro de extração atravessa a thread com a mensagem para a pessoa", async () => {
    const naoPdf = new TextEncoder().encode("%PDF-1.4 isto não é um PDF de verdade");
    await expect(extrairIsolado(naoPdf, "pdf")).rejects.toBeInstanceOf(ErroExtracao);
  });

  it("MD e TXT ficam no próprio processo (não há o que descompactar)", async () => {
    const md = new TextEncoder().encode("# Título\n\nUm parágrafo.");
    await expect(extrairIsolado(md, "md")).resolves.toMatchObject({
      texto: expect.stringContaining("Um parágrafo"),
    });
  });

  it("extração presa: encerra no prazo e explica", async () => {
    const r = extrairIsolado(new Uint8Array([1]), "docx", {
      timeoutMs: 300,
      arquivo: teste("trabalhador-trava.ts"),
    });
    await expect(r).rejects.toThrow(/demorou demais/);
  });

  it("arquivo que estoura a memória: a thread morre, a API não", async () => {
    const r = extrairIsolado(new Uint8Array([1]), "docx", {
      memoriaMb: 32,
      arquivo: teste("trabalhador-memoria.ts"),
    });
    await expect(r).rejects.toThrow(/memória/);
  }, 30_000);
});
