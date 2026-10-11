import { describe, expect, it } from "vitest";
import { dividirTexto } from "./divisor.js";

const palavras = (n: number, prefixo = "palavra"): string =>
  Array.from({ length: n }, (_, i) => `${prefixo}${i}`).join(" ");

describe("dividirTexto", () => {
  it("devolve o texto inteiro quando ele cabe num trecho", () => {
    expect(dividirTexto("Um parágrafo curto.", { tamanhoMaximo: 100, sobreposicao: 10 })).toEqual([
      "Um parágrafo curto.",
    ]);
  });

  it("devolve lista vazia para texto vazio ou só com espaços", () => {
    expect(dividirTexto("   \n\n  ", { tamanhoMaximo: 100, sobreposicao: 10 })).toEqual([]);
  });

  it("separa primeiro pelas seções markdown", () => {
    const secao1 = `# Regras\n${palavras(10, "a")}`;
    const secao2 = `## Taxas\n${palavras(10, "b")}`;
    const trechos = dividirTexto(`${secao1}\n${secao2}`, { tamanhoMaximo: 120, sobreposicao: 0 });
    expect(trechos).toEqual([secao1, secao2]);
  });

  it("depois por parágrafos, juntando os que cabem no mesmo trecho", () => {
    const texto = ["Primeiro parágrafo.", "Segundo parágrafo.", "Terceiro parágrafo."].join("\n\n");
    const trechos = dividirTexto(texto, { tamanhoMaximo: 45, sobreposicao: 0 });
    expect(trechos).toEqual(["Primeiro parágrafo.\n\nSegundo parágrafo.", "Terceiro parágrafo."]);
  });

  it("depois por frases e por fim por palavras, sem passar do tamanho máximo", () => {
    const frase = `${palavras(30)}.`;
    const texto = `${frase} ${frase}`;
    const trechos = dividirTexto(texto, { tamanhoMaximo: 80, sobreposicao: 0 });
    expect(trechos.length).toBeGreaterThan(2);
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(80);
  });

  it("nunca corta no meio de uma palavra", () => {
    const texto = palavras(200);
    const conhecidas = new Set(texto.split(" "));
    for (const trecho of dividirTexto(texto, { tamanhoMaximo: 50, sobreposicao: 15 })) {
      for (const p of trecho.split(/\s+/)) expect(conhecidas.has(p)).toBe(true);
    }
  });

  it("repete o fim do trecho anterior no começo do seguinte (sobreposição)", () => {
    const texto = palavras(60);
    const trechos = dividirTexto(texto, { tamanhoMaximo: 100, sobreposicao: 25 });
    for (let i = 1; i < trechos.length; i++) {
      const ultimaDoAnterior = trechos[i - 1]!.split(" ").at(-1)!;
      expect(trechos[i]!.split(" ")).toContain(ultimaDoAnterior);
    }
  });

  it("não perde nenhuma palavra", () => {
    const texto = `# Título\n${palavras(80)}\n\n${palavras(40, "x")}. ${palavras(40, "y")}.`;
    const trechos = dividirTexto(texto, { tamanhoMaximo: 120, sobreposicao: 20 });
    const vistas = new Set(trechos.flatMap((t) => t.split(/\s+/)));
    for (const p of texto.split(/\s+/)) expect(vistas.has(p)).toBe(true);
  });

  it("mantém inteira uma palavra maior que o tamanho máximo (ex.: URL longa)", () => {
    const url = `https://exemplo.com/${"a".repeat(80)}`;
    const trechos = dividirTexto(`veja ${url} agora`, { tamanhoMaximo: 30, sobreposicao: 0 });
    expect(trechos).toContain(url);
  });

  it("usa ~1200 caracteres e sobreposição pequena por padrão", () => {
    const trechos = dividirTexto(palavras(1000));
    expect(trechos.length).toBeGreaterThan(5);
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(1200);
  });

  it("recusa configuração impossível com mensagem clara", () => {
    expect(() => dividirTexto("x", { tamanhoMaximo: 0, sobreposicao: 0 })).toThrow(/tamanhoMaximo/);
    expect(() => dividirTexto("x", { tamanhoMaximo: 100, sobreposicao: 100 })).toThrow(/sobreposicao/);
  });
});
