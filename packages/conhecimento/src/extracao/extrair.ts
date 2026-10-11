import mammoth from "mammoth";
import { decodificarTexto } from "./detectar.js";
import { textoDoHtml } from "./html.js";
import { ErroExtracao, limitarTexto, type TextoExtraido, type TipoExtraivel } from "./tipos.js";

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  try {
    // Cópia: o pdf.js pode transferir (e esvaziar) o buffer que recebe.
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: false });
    return text
      .map((pagina, i) => ({ n: i + 1, conteudo: pagina.trim() }))
      .filter((p) => p.conteudo !== "")
      .map((p) => `[Página ${p.n}]\n${p.conteudo}`)
      .join("\n\n");
  } catch (e) {
    const protegido = e instanceof Error && e.name === "PasswordException";
    throw new ErroExtracao(
      protegido
        ? "Este PDF está protegido por senha. Tire a senha (imprima como PDF, por exemplo) e envie de novo."
        : "Não deu para ler este PDF: o arquivo parece corrompido ou não é um PDF válido.",
      { cause: e },
    );
  }
}

async function textoDoDocx(bytes: Uint8Array): Promise<string> {
  try {
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return r.value;
  } catch (e) {
    throw new ErroExtracao("Não deu para ler este .docx: o arquivo parece corrompido.", { cause: e });
  }
}

/**
 * Texto de um arquivo, pronto para o RAG. PDF página a página (com a marcação
 * "[Página N]", para citar de onde veio), DOCX pelo mammoth, HTML pela Readability e
 * MD/TXT como texto UTF-8. Arquivo sem texto (PDF escaneado, por exemplo) é recusado.
 */
export async function extrairTexto(bytes: Uint8Array, tipo: TipoExtraivel): Promise<TextoExtraido> {
  let texto: string;
  let titulo: string | null = null;
  if (tipo === "pdf") texto = await textoDoPdf(bytes);
  else if (tipo === "docx") texto = await textoDoDocx(bytes);
  else if (tipo === "html") ({ texto, titulo } = textoDoHtml(decodificarTexto(bytes)));
  else texto = decodificarTexto(bytes);
  if (texto.trim() === "") {
    throw new ErroExtracao(
      tipo === "pdf"
        ? "Não achei texto neste PDF (pode ser uma imagem escaneada). Envie um PDF com texto selecionável."
        : "Não achei texto neste arquivo.",
    );
  }
  return limitarTexto(texto.trim(), titulo);
}
