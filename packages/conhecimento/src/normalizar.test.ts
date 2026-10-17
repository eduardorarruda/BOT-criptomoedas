import { describe, expect, it } from "vitest";
import { hashConteudo, normalizarTexto, termosDeBusca } from "./normalizar.js";

describe("normalizarTexto", () => {
  it("unifica quebras de linha, tira espaços sobrando e linhas vazias em excesso", () => {
    expect(normalizarTexto("  Título\r\n\r\n\r\n\r\nCorpo   com\t espaços  \r\nfim  ")).toBe(
      "Título\n\nCorpo com espaços\nfim",
    );
  });

  it("compõe acentos da mesma forma (NFC)", () => {
    expect(normalizarTexto("á")).toBe("á");
  });
});

describe("normalizarTexto contra texto hostil", () => {
  it("remove caracteres de controle e sequências de escape de terminal, mantendo quebras e tabs", () => {
    const hostil = "Título\u001b[2J\u001b[31mvermelho\u0007 fim\nlinha\tcom tab\u0000";
    expect(normalizarTexto(hostil)).toBe("Títulovermelho fim\nlinha com tab");
  });
});

describe("hashConteudo", () => {
  it("é igual para textos que só diferem em espaços e quebras de linha", () => {
    expect(hashConteudo("Taxa de 0,1%\r\n")).toBe(hashConteudo("  Taxa  de 0,1%"));
  });

  it("muda quando o conteúdo muda e tem formato sha256 hexadecimal", () => {
    expect(hashConteudo("a")).not.toBe(hashConteudo("b"));
    expect(hashConteudo("a")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("termosDeBusca", () => {
  it("vira uma consulta OU de palavras com 3+ letras, sem stopwords nem repetição, segura para to_tsquery", () => {
    expect(termosDeBusca("Qual é a TAXA de saque? taxa & ! 'drop'")).toBe("taxa | saque | drop");
  });

  it("devolve null quando não sobra palavra", () => {
    expect(termosDeBusca("é a o ?")).toBeNull();
    expect(termosDeBusca("como para que")).toBeNull();
  });

  it("acrescenta o singular ou o plural de -ção/-ções e -ão/-ões, com e sem acento", () => {
    expect(termosDeBusca("ações")).toBe("ações | ação");
    expect(termosDeBusca("operacao")).toBe("operacao | operacoes");
    expect(termosDeBusca("opções de compra")).toBe("opções | compra | opção");
  });

  it("não passa de 64 termos, mesmo com as variações", () => {
    const muitas = Array.from({ length: 50 }, (_, i) => `posicao${"x".repeat(i)}ao`).join(" ");
    expect(termosDeBusca(muitas)!.split(" | ").length).toBeLessThanOrEqual(64);
  });
});
