import { ErroExtracao, type TipoExtraivel } from "./tipos.js";

/**
 * O tipo do arquivo é conferido pelo conteúdo, não só pela extensão: um ".pdf" que não
 * começa com %PDF, ou um ".txt" com bytes binários, é recusado antes de qualquer leitura.
 */
const EXTENSOES: Readonly<Record<string, TipoExtraivel>> = {
  pdf: "pdf",
  docx: "docx",
  md: "md",
  markdown: "md",
  txt: "txt",
  text: "txt",
  html: "html",
  htm: "html",
};

const PDF = Buffer.from("%PDF-");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const comeca = (bytes: Uint8Array, prefixo: Uint8Array): boolean =>
  bytes.length >= prefixo.length && prefixo.every((b, i) => bytes[i] === b);

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto < 0 ? "" : nome.slice(ponto + 1).toLowerCase();
}

/** Texto de verdade: UTF-8 válido e sem byte nulo (arquivo binário renomeado para .txt). */
export function decodificarTexto(bytes: Uint8Array): string {
  if (bytes.includes(0))
    throw new ErroExtracao("O arquivo parece binário, não texto. Envie PDF, DOCX, MD, TXT ou HTML.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new ErroExtracao("O texto não está em UTF-8. Salve o arquivo como UTF-8 e envie de novo.");
  }
}

export function detectarTipo(nome: string, bytes: Uint8Array): TipoExtraivel {
  if (bytes.length === 0) throw new ErroExtracao("O arquivo está vazio.");
  const tipo = EXTENSOES[extensaoDe(nome)];
  if (!tipo) {
    throw new ErroExtracao("Tipo de arquivo não aceito. Envie PDF, DOCX, MD, TXT ou HTML.");
  }
  if (tipo === "pdf" && !comeca(bytes, PDF)) {
    throw new ErroExtracao("O arquivo tem extensão .pdf mas não é um PDF.");
  }
  if (tipo === "docx" && !comeca(bytes, ZIP)) {
    throw new ErroExtracao("O arquivo tem extensão .docx mas não é um documento do Word (.docx).");
  }
  if ((tipo === "md" || tipo === "txt" || tipo === "html") && (comeca(bytes, PDF) || comeca(bytes, ZIP))) {
    throw new ErroExtracao(`O arquivo não é ${tipo.toUpperCase()}: confira a extensão.`);
  }
  return tipo;
}
