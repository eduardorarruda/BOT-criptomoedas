import { extrairTexto } from "./extrair.js";
import { baixarPagina, type OpcoesBaixarPagina } from "./pagina.js";
import type { TextoExtraido, TipoExtraivel } from "./tipos.js";

export interface LinkLido extends TextoExtraido {
  readonly url: string;
  readonly tipo: TipoExtraivel;
  readonly bytes: number;
}

export type Extrator = (bytes: Uint8Array, tipo: TipoExtraivel) => Promise<TextoExtraido>;

/**
 * Baixa o link (com a defesa contra SSRF de baixarPagina) e extrai o texto. Quem roda
 * num servidor que atende várias pessoas passa um extrator isolado (worker com teto).
 */
export async function lerLink(
  url: string,
  opcoes: OpcoesBaixarPagina = {},
  extrair: Extrator = extrairTexto,
): Promise<LinkLido> {
  const pagina = await baixarPagina(url, opcoes);
  const texto = await extrair(pagina.bytes, pagina.tipo);
  return { ...texto, url: pagina.url, tipo: pagina.tipo, bytes: pagina.bytes.length };
}
