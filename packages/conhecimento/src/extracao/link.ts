import { extrairTexto } from "./extrair.js";
import { baixarPagina, type OpcoesBaixarPagina } from "./pagina.js";
import type { TextoExtraido, TipoExtraivel } from "./tipos.js";

export interface LinkLido extends TextoExtraido {
  readonly url: string;
  readonly tipo: TipoExtraivel;
  readonly bytes: number;
}

/** Baixa o link (com a defesa contra SSRF de baixarPagina) e extrai o texto. */
export async function lerLink(url: string, opcoes: OpcoesBaixarPagina = {}): Promise<LinkLido> {
  const pagina = await baixarPagina(url, opcoes);
  const texto = await extrairTexto(pagina.bytes, pagina.tipo);
  return { ...texto, url: pagina.url, tipo: pagina.tipo, bytes: pagina.bytes.length };
}
