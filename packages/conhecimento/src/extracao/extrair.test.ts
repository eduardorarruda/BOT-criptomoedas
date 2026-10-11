import { describe, expect, it } from "vitest";
import { docxComParagrafos, pdfComTexto } from "../teste/arquivos.js";
import { decodificarTexto, detectarTipo, extensaoDe } from "./detectar.js";
import { extrairTexto } from "./extrair.js";
import { textoDoHtml } from "./html.js";
import { ErroExtracao, LIMITE_CARACTERES_EXTRAIDOS, limitarTexto } from "./tipos.js";

const texto = (t: string) => Buffer.from(t, "utf8");

describe("detectarTipo", () => {
  it("aceita os cinco tipos quando o conteúdo confere com a extensão", () => {
    expect(detectarTipo("a.PDF", pdfComTexto(["oi"]))).toBe("pdf");
    expect(detectarTipo("a.docx", docxComParagrafos(["oi"]))).toBe("docx");
    expect(detectarTipo("notas.md", texto("# título"))).toBe("md");
    expect(detectarTipo("a.markdown", texto("x"))).toBe("md");
    expect(detectarTipo("a.txt", texto("x"))).toBe("txt");
    expect(detectarTipo("pagina.htm", texto("<p>x</p>"))).toBe("html");
  });

  it("recusa extensão desconhecida, arquivo vazio e conteúdo que não bate", () => {
    expect(() => detectarTipo("a.exe", texto("x"))).toThrow(/não aceito/);
    expect(() => detectarTipo("sem-extensao", texto("x"))).toThrow(ErroExtracao);
    expect(() => detectarTipo("a.pdf", Buffer.alloc(0))).toThrow(/vazio/);
    expect(() => detectarTipo("a.pdf", texto("não sou pdf"))).toThrow(/não é um PDF/);
    expect(() => detectarTipo("a.docx", texto("texto"))).toThrow(/Word/);
    expect(() => detectarTipo("a.txt", pdfComTexto(["x"]))).toThrow(/não é TXT/);
  });

  it("extensão sai em minúsculas e vazia sem ponto", () => {
    expect(extensaoDe("Relatório.Final.DOCX")).toBe("docx");
    expect(extensaoDe("LEIAME")).toBe("");
  });
});

describe("decodificarTexto", () => {
  it("tira o BOM e recusa binário e texto que não é UTF-8", () => {
    expect(decodificarTexto(Buffer.from([0xef, 0xbb, 0xbf, 0x6f, 0x69]))).toBe("oi");
    expect(() => decodificarTexto(Buffer.from([0x61, 0x00, 0x62]))).toThrow(/binário/);
    expect(() => decodificarTexto(Buffer.from([0xc3, 0x28]))).toThrow(/UTF-8/);
  });
});

describe("extrairTexto", () => {
  it("PDF: texto de cada página com a marcação da página", async () => {
    const r = await extrairTexto(pdfComTexto(["Taxa de 0,1% por ordem", "Saque minimo de 10 USDT"]), "pdf");
    expect(r.texto).toContain("[Página 1]");
    expect(r.texto).toContain("Taxa de 0,1% por ordem");
    expect(r.texto).toContain("[Página 2]\nSaque minimo de 10 USDT");
    expect(r.truncado).toBe(false);
    expect(r.caracteres).toBe(r.texto.length);
  });

  it("PDF quebrado vira erro que a pessoa entende", async () => {
    await expect(extrairTexto(Buffer.from("%PDF-1.4\nlixo"), "pdf")).rejects.toThrow(
      /Não deu para ler este PDF/,
    );
  });

  it("DOCX: parágrafos do documento", async () => {
    const r = await extrairTexto(
      docxComParagrafos(["Plano de risco", "Nunca mais de 2% por operação"]),
      "docx",
    );
    expect(r.texto).toMatch(/Plano de risco\s+Nunca mais de 2% por operação/);
  });

  it("DOCX corrompido vira erro tratado", async () => {
    await expect(extrairTexto(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "docx")).rejects.toThrow(
      /corrompido/,
    );
  });

  it("MD e TXT como texto; HTML pelo leitor de artigo, com o título da página", async () => {
    expect((await extrairTexto(texto("# Regras\n\nSem alavancagem."), "md")).texto).toBe(
      "# Regras\n\nSem alavancagem.",
    );
    const html = `<html><head><title>Guia</title></head><body><script>roubar()</script>
      <p>${"Stop sempre abaixo do suporte. ".repeat(12)}</p></body></html>`;
    const r = await extrairTexto(texto(html), "html");
    expect(r.titulo).toBe("Guia");
    expect(r.texto).toContain("Stop sempre abaixo do suporte.");
    expect(r.texto).not.toContain("roubar");
  });

  it("arquivo sem texto é recusado", async () => {
    await expect(extrairTexto(texto("   \n  "), "txt")).rejects.toThrow(/Não achei texto/);
    await expect(extrairTexto(pdfComTexto([""]), "pdf")).rejects.toThrow(/escaneada/);
  });
});

describe("textoDoHtml", () => {
  it("sem artigo, usa o texto do corpo sem script, estilo e navegação", () => {
    const r = textoDoHtml(
      "<html><body><nav>Menu</nav><style>p{}</style><h1>Curto</h1><p>Um parágrafo.</p><li>Item</li></body></html>",
    );
    expect(r.texto).toBe("Curto\n\nUm parágrafo.\n\nItem");
    expect(r.titulo).toBeNull();
  });

  it("artigo longo: mantém os parágrafos separados", () => {
    const p = (t: string) => `<p>${t.repeat(10)}</p>`;
    const r = textoDoHtml(
      `<html><body><article>${p("Primeiro bloco. ")}${p("Segundo bloco. ")}</article></body></html>`,
    );
    expect(r.texto.split("\n\n")).toHaveLength(2);
  });
});

describe("limitarTexto", () => {
  it("corta no limite e avisa", () => {
    const r = limitarTexto("x".repeat(LIMITE_CARACTERES_EXTRAIDOS + 5));
    expect(r).toMatchObject({ truncado: true, caracteres: LIMITE_CARACTERES_EXTRAIDOS });
  });
});

describe("DOCX descompactado grande demais (zip bomb)", () => {
  /** Reescreve, no diretório central, o tamanho descompactado declarado de cada entrada. */
  function comTamanhoDeclarado(docx: Buffer, bytes: number): Buffer {
    const copia = Buffer.from(docx);
    for (let i = 0; i + 4 <= copia.length; i++) {
      if (copia.readUInt32LE(i) === 0x02014b50) copia.writeUInt32LE(bytes, i + 24);
    }
    return copia;
  }

  it("recusa antes de abrir quando o zip declara mais de 100 MB descompactados", async () => {
    const bomba = comTamanhoDeclarado(docxComParagrafos(["x"]), 0x7fffffff);
    await expect(extrairTexto(bomba, "docx")).rejects.toThrow(/descompactado/);
  });

  it("aceita um docx normal", async () => {
    await expect(extrairTexto(docxComParagrafos(["oi"]), "docx")).resolves.toMatchObject({
      texto: expect.stringContaining("oi"),
    });
  });
});
