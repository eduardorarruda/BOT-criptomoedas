/**
 * Vocabulário da renda fixa, compartilhado pelas regras de imposto, pelos
 * indexadores e pela posição de cada título.
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
export type TipoTitulo = (typeof TIPOS_TITULO)[number];

/**
 * Como o título rende. CDI e SELIC: pós-fixados (percentual do índice e, se houver,
 * taxa fixa somada). IPCA: inflação + taxa real. PREFIXADO: só a taxa anual.
 * POUPANCA: a regra da poupança (Lei 8.177/1991, art. 12).
 */
export const INDEXADORES = ["CDI", "SELIC", "IPCA", "PREFIXADO", "POUPANCA"] as const;
export type Indexador = (typeof INDEXADORES)[number];

export const LIQUIDEZES = ["diaria", "vencimento", "carencia"] as const;
export type Liquidez = (typeof LIQUIDEZES)[number];

export const ROTULO_TIPO: Readonly<Record<TipoTitulo, string>> = {
  CDB: "CDB",
  LC: "LC",
  LCI: "LCI",
  LCA: "LCA",
  CRI: "CRI",
  CRA: "CRA",
  DEBENTURE: "Debênture",
  DEBENTURE_INCENTIVADA: "Debênture incentivada",
  TESOURO_SELIC: "Tesouro Selic",
  TESOURO_PREFIXADO: "Tesouro Prefixado",
  TESOURO_IPCA: "Tesouro IPCA+",
  POUPANCA: "Poupança",
  CAIXINHA: "Caixinha",
  OUTRO: "Outro",
};
