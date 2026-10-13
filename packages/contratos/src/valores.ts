/**
 * As listas fixas dos contratos, sem Zod: a tela valida os filtros da URL com elas
 * logo na abertura, antes de carregar os esquemas (`@zentrade/contratos/valores`).
 * Os esquemas de cada assunto reexportam daqui.
 */

export const TIPOS_TITULO = [
  "CDB",
  "LC",
  "LCI",
  "LCA",
  "CRI",
  "CRA",
  "DEBENTURE",
  "DEBENTURE_INCENTIVADA",
  "TESOURO_SELIC",
  "TESOURO_PREFIXADO",
  "TESOURO_IPCA",
  "POUPANCA",
  "CAIXINHA",
  "OUTRO",
] as const;

export const INDEXADORES = ["CDI", "SELIC", "IPCA", "PREFIXADO", "POUPANCA"] as const;
export const LIQUIDEZES = ["diaria", "vencimento", "carencia"] as const;
export const ORIGENS_TITULO = ["manual", "pluggy"] as const;

export const TIPOS_IMOBILIARIO = [
  "aluguel",
  "temporada",
  "flip",
  "terreno",
  "planta",
  "fii",
  "reit",
  "crowdfunding",
  "consorcio",
] as const;

/** Na ordem em que a tela mostra. */
export const CLASSES_PATRIMONIO = ["cripto", "renda_fixa", "imobiliario"] as const;
