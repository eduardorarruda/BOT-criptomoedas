export { decodificarTexto, detectarTipo, extensaoDe } from "./detectar.js";
export { extrairTexto } from "./extrair.js";
export { textoDoHtml, type TextoDoHtml } from "./html.js";
export { lerLink, type LinkLido } from "./link.js";
export { baixarPagina, validarUrl, type OpcoesBaixarPagina, type PaginaBaixada } from "./pagina.js";
export { enderecoPublico, ERRO_REDE_INTERNA, lookupSeguro, type PermitirEndereco } from "./rede.js";
export {
  ErroExtracao,
  LIMITE_CARACTERES_EXTRAIDOS,
  TIPOS_EXTRAIVEIS,
  type TextoExtraido,
  type TipoExtraivel,
} from "./tipos.js";
