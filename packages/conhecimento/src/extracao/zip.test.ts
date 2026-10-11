import { describe, expect, it } from "vitest";
import { docxComParagrafos } from "../teste/arquivos.js";
import { tamanhoDescompactadoDeclarado } from "./zip.js";

const central = (b: Buffer): number => b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

describe("tamanho descompactado declarado no ZIP", () => {
  it("soma as entradas de um docx normal", () => {
    const docx = docxComParagrafos(["um parágrafo"]);
    expect(tamanhoDescompactadoDeclarado(docx)).toBeGreaterThan(0);
  });

  it("não é ZIP (ou curto demais): null", () => {
    expect(tamanhoDescompactadoDeclarado(Buffer.from("texto qualquer, não é zip"))).toBeNull();
    expect(tamanhoDescompactadoDeclarado(new Uint8Array(4))).toBeNull();
  });

  it("ZIP64 conta como infinito", () => {
    const docx = Buffer.from(docxComParagrafos(["x"]));
    docx.writeUInt32LE(0xffffffff, central(docx) + 24);
    expect(tamanhoDescompactadoDeclarado(docx)).toBe(Number.POSITIVE_INFINITY);
  });

  it("diretório central quebrado: null", () => {
    const docx = Buffer.from(docxComParagrafos(["x"]));
    docx.writeUInt32LE(0, central(docx));
    expect(tamanhoDescompactadoDeclarado(docx)).toBeNull();
  });
});
