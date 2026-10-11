import type { TituloSincronizado } from "@zentrade/banco";
import type { Indexador, TipoTitulo } from "@zentrade/contratos";
import { dec, paraTexto } from "@zentrade/dominio";
import type { InvestimentoPluggyApi } from "./pluggy.js";

/**
 * Investimento da Pluggy → título de renda fixa. Só entra FIXED_INCOME ativo com
 * indexador que sabemos calcular; o resto conta como "ignorado" (a tela diz quantos).
 *
 * Armadilha do Nubank (vista em dados reais no Fluxo): as caixinhas chegam pelo Open
 * Finance como CDBs da Nu Financeira, um por depósito e sem o nome da caixinha. Cada
 * lote vira um título (o IR depende da data de cada um) e todos ganham o mesmo
 * `grupo` por taxa, para a tela mostrar "Caixinhas · 100% do CDI" junto.
 */
export const CNPJ_NU_FINANCEIRA = "30680829000143";
const FUSO = "America/Sao_Paulo";

const diaLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Datas de calendário da Pluggy chegam como meia-noite UTC: converter para o fuso
 * jogaria tudo para o dia anterior no Brasil. Instantes com hora viram o dia local.
 */
export function diaDoProvedor(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  const meiaNoiteUtc = data.getUTCHours() === 0 && data.getUTCMinutes() === 0 && data.getUTCSeconds() === 0;
  return meiaNoiteUtc ? data.toISOString().slice(0, 10) : diaLocal.format(data);
}

const SUBTIPOS: Readonly<Record<string, TipoTitulo>> = {
  CDB: "CDB",
  LC: "LC",
  LCI: "LCI",
  LCA: "LCA",
  CRI: "CRI",
  CRA: "CRA",
  DEBENTURES: "DEBENTURE",
};

function indexadorDe(i: InvestimentoPluggyApi): Indexador | null {
  switch ((i.rateType ?? "").toUpperCase()) {
    case "CDI":
      return "CDI";
    case "SELIC":
      return "SELIC";
    case "IPCA":
      return "IPCA";
    case "":
      return (i.fixedAnnualRate ?? i.rate ?? null) !== null ? "PREFIXADO" : null;
    default:
      return null; // IGPM, dólar, euro: ainda não calculamos
  }
}

function tipoDe(i: InvestimentoPluggyApi, indexador: Indexador): TipoTitulo {
  if (i.subtype === "TREASURY") {
    if (indexador === "SELIC") return "TESOURO_SELIC";
    if (indexador === "IPCA") return "TESOURO_IPCA";
    return "TESOURO_PREFIXADO";
  }
  return SUBTIPOS[i.subtype ?? ""] ?? "OUTRO";
}

const somenteDigitos = (v: string | null | undefined): string | null =>
  v ? v.replace(/\D/g, "") || null : null;
const texto = (n: number | null | undefined): string | null =>
  n === null || n === undefined ? null : paraTexto(dec(n));

export const ehCaixinhaNubank = (i: InvestimentoPluggyApi): boolean =>
  i.type === "FIXED_INCOME" && i.subtype === "CDB" && somenteDigitos(i.issuerCNPJ) === CNPJ_NU_FINANCEIRA;

function taxas(
  i: InvestimentoPluggyApi,
  indexador: Indexador,
): { percentual: string | null; anual: string | null } {
  if (indexador === "CDI" || indexador === "SELIC")
    return { percentual: texto(i.rate ?? 100), anual: texto(i.fixedAnnualRate) };
  if (indexador === "PREFIXADO") return { percentual: null, anual: texto(i.fixedAnnualRate ?? i.rate) };
  return { percentual: null, anual: texto(i.fixedAnnualRate) };
}

/** Bruto = amount (com imposto); líquido = balance; aplicado = amountOriginal ou o líquido menos o lucro. */
function valores(i: InvestimentoPluggyApi) {
  const bruto = dec(i.amount ?? i.balance);
  const original = i.amountOriginal ?? null;
  const aplicado = original !== null ? dec(original) : dec(i.balance).minus(i.amountProfit ?? 0);
  return {
    bruto: paraTexto(bruto),
    liquido: paraTexto(dec(i.balance)),
    aplicado: paraTexto(aplicado.isNegative() ? bruto : aplicado),
    ir: texto(i.taxes),
    iof: texto(i.taxes2),
  };
}

function normalizarUm(i: InvestimentoPluggyApi, hoje: string): TituloSincronizado | null {
  if (i.type !== "FIXED_INCOME" || i.status === "TOTAL_WITHDRAWAL") return null;
  const indexador = indexadorDe(i);
  const dataAplicacao = diaDoProvedor(i.purchaseDate) ?? diaDoProvedor(i.issueDate);
  if (!indexador || !dataAplicacao) return null;
  const caixinha = ehCaixinhaNubank(i);
  const { percentual, anual } = taxas(i, indexador);
  const v = valores(i);
  const rotuloTaxa = percentual ? `${percentual.replace(".", ",")}% do CDI` : "";
  return {
    externoId: i.id,
    grupo: caixinha ? `nubank-caixinha:${percentual ?? "100"}` : null,
    tipo: caixinha ? "CAIXINHA" : tipoDe(i, indexador),
    nome: caixinha
      ? `Caixinhas Nubank · ${rotuloTaxa}`
      : i.name?.trim() || `${i.subtype ?? "Título"} ${i.issuer ?? ""}`.trim(),
    emissor: i.issuer?.trim() || null,
    emissorCnpj: somenteDigitos(i.issuerCNPJ),
    indexador,
    percentualIndexador: percentual,
    taxaAnual: anual,
    dataAplicacao,
    vencimento: caixinha ? null : diaDoProvedor(i.dueDate),
    valorAplicado: v.aplicado,
    liquidez: caixinha ? "diaria" : "vencimento",
    informadoEm: diaDoProvedor(i.date) ?? hoje,
    bruto: v.bruto,
    liquido: v.liquido,
    ir: v.ir,
    iof: v.iof,
  };
}

export interface Normalizados {
  readonly titulos: TituloSincronizado[];
  /** Investimentos que ficaram de fora: resgatados, fundos, ações, IGP-M/dólar ou sem data de aplicação. */
  readonly ignorados: number;
}

export function normalizarInvestimentos(
  investimentos: readonly InvestimentoPluggyApi[],
  hoje: string,
): Normalizados {
  const titulos = investimentos
    .map((i) => normalizarUm(i, hoje))
    .filter((t): t is TituloSincronizado => t !== null);
  return { titulos, ignorados: investimentos.length - titulos.length };
}
