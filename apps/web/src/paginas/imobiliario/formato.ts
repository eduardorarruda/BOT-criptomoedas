import type { TipoImobiliario, TipoLancamentoImobiliario } from "@zentrade/contratos/esquemas";
import { dec, type Valor } from "@zentrade/dominio";
import {
  Building2,
  Construction,
  Globe,
  Hammer,
  House,
  KeyRound,
  LandPlot,
  TreePalm,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { lerDecimalDigitado } from "../../lib/entrada";
import { formatarPercentual, TRACO } from "../../lib/formatar";

/**
 * Formatação do imobiliário: tudo em reais (o resto do app é em dólar), sem passar
 * por ponto flutuante. Os rótulos de tipo e categoria também moram aqui.
 */
const MENOS = "−";
const METADE_PARA_CIMA = 4;

function lerValor(v: string | Valor | null | undefined): Valor | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  if (v.trim() === "") return null;
  try {
    return dec(v);
  } catch {
    return null;
  }
}

const agrupar = (inteiro: string): string => inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function absoluto(v: Valor, casas: number): string {
  const [inteiro = "0", fracao] = v.abs().toFixed(casas, METADE_PARA_CIMA).split(".");
  return fracao ? `${agrupar(inteiro)},${fracao}` : agrupar(inteiro);
}

function compacto(v: Valor): string {
  const a = v.abs();
  if (a.gte(1_000_000))
    return `${absoluto(dec(a.div(1_000_000).toSignificantDigits(3)), 2).replace(/,?0+$/, "")} mi`;
  if (a.gte(1_000)) return `${absoluto(dec(a.div(1_000).toSignificantDigits(3)), 1).replace(/,0$/, "")} mil`;
  return absoluto(a, 0);
}

export interface OpcoesReais {
  readonly sinal?: boolean;
  readonly casas?: number;
  readonly compacto?: boolean;
}

/** "R$ 1.234,56"; negativo com o menos tipográfico antes do símbolo. */
export function formatarReais(texto: string | Valor | null | undefined, o: OpcoesReais = {}): string {
  const v = lerValor(texto);
  if (!v) return TRACO;
  const casas = o.casas ?? 2;
  const arredondado = v.toDecimalPlaces(o.compacto ? 0 : casas, METADE_PARA_CIMA);
  const prefixo = arredondado.isZero() ? "" : arredondado.isNegative() ? MENOS : o.sinal ? "+" : "";
  return `${prefixo}R$ ${o.compacto ? compacto(v) : absoluto(v, casas)}`;
}

/** Fração → "10,50%" (null → traço). */
export const formatarTaxa = (fracao: number | null | undefined, casas = 2): string =>
  fracao === null || fracao === undefined ? TRACO : formatarPercentual(fracao, { casas });

export function formatarAnos(anos: number | null): string {
  if (anos === null) return "não recupera no período";
  const texto = anos.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${texto} ${anos === 1 ? "ano" : "anos"}`;
}

/** "R$ 1.234,56", "1234,56" → "1234.56"; "2.800" (pontos só de milhar) → "2800". */
export function lerReaisDigitado(texto: string): string | null {
  const limpo = texto.replace(/^\s*R\$\s*/i, "").trim();
  const soMilhar = /^-?\d{1,3}(\.\d{3})+$/.test(limpo);
  return lerDecimalDigitado(soMilhar ? limpo.replace(/\./g, "") : limpo);
}

/** "10,5" ou "10,5%" → 0,105. */
export function lerPercentualDigitado(texto: string): number | null {
  const v = lerDecimalDigitado(texto.replace(/%\s*$/, ""));
  return v === null ? null : dec(v).div(100).toNumber();
}

export interface DescricaoTipo {
  readonly rotulo: string;
  readonly descricao: string;
  readonly icone: LucideIcon;
  readonly grupo: "imovel" | "cotas" | "outros";
}

export const TIPOS: Record<TipoImobiliario, DescricaoTipo> = {
  aluguel: {
    rotulo: "Imóvel para aluguel",
    descricao: "Compra para alugar por mês: aluguel, condomínio, IPTU, vacância e financiamento.",
    icone: House,
    grupo: "imovel",
  },
  temporada: {
    rotulo: "Aluguel por temporada",
    descricao: "Diárias, ocupação e taxa da plataforma; a renda varia mês a mês.",
    icone: TreePalm,
    grupo: "imovel",
  },
  flip: {
    rotulo: "Revenda (flip)",
    descricao: "Comprar, reformar e vender: custos, prazo e preço de venda.",
    icone: Hammer,
    grupo: "imovel",
  },
  terreno: {
    rotulo: "Terreno ou loteamento",
    descricao: "Aportes no tempo e valorização; sem renda até vender ou construir.",
    icone: LandPlot,
    grupo: "imovel",
  },
  planta: {
    rotulo: "Imóvel na planta",
    descricao: "Sinal, parcelas da obra e data de entrega; valoriza até as chaves.",
    icone: Construction,
    grupo: "imovel",
  },
  fii: {
    rotulo: "Fundo imobiliário (FII)",
    descricao: "Cotas na B3: compras, vendas, proventos e preço médio.",
    icone: Building2,
    grupo: "cotas",
  },
  reit: {
    rotulo: "REIT (exterior)",
    descricao: "Fundo imobiliário dos EUA, em dólar, com o câmbio de cada lançamento.",
    icone: Globe,
    grupo: "cotas",
  },
  crowdfunding: {
    rotulo: "Crowdfunding imobiliário",
    descricao: "Aporte numa plataforma de investimento coletivo: juros e devolução do capital.",
    icone: UsersRound,
    grupo: "outros",
  },
  consorcio: {
    rotulo: "Consórcio imobiliário",
    descricao: "Carta de crédito, parcelas, lances e contemplação.",
    icone: KeyRound,
    grupo: "outros",
  },
};

export const ROTULO_LANCAMENTO: Record<TipoLancamentoImobiliario, string> = {
  aporte: "Aporte",
  receita: "Receita",
  despesa: "Despesa",
  resgate: "Resgate ou venda",
  imposto: "Imposto",
};

export const DESCRICAO_LANCAMENTO: Record<TipoLancamentoImobiliario, string> = {
  aporte: "Dinheiro que você pôs: compra, ITBI, reforma, parcela, lance, compra de cotas.",
  receita: "Dinheiro que entrou como renda: aluguel, diárias, proventos, juros.",
  despesa: "Custos do dia a dia: condomínio, IPTU, manutenção, administração.",
  resgate: "Dinheiro de volta como capital: venda do imóvel, venda de cotas, devolução.",
  imposto: "IR pago (ganho de capital, carnê-leão).",
};

export const CATEGORIAS: Record<TipoLancamentoImobiliario, readonly string[]> = {
  aporte: ["compra", "entrada", "itbi", "escritura", "reforma", "sinal", "parcela", "lance", "aporte"],
  receita: ["aluguel", "diaria", "provento", "dividendo", "juros"],
  despesa: ["condominio", "iptu", "manutencao", "administracao", "seguro", "plataforma", "vacancia"],
  resgate: ["venda", "amortizacao", "devolucao"],
  imposto: ["ganho de capital", "carne-leao"],
};

export const FONTE_VALOR: Record<string, string> = {
  cotacao: "pela cotação da brapi",
  manual: "informado por você",
  valorizacao: "estimado pela valorização que você informou",
  custo: "pelo custo (sem valor atual informado)",
  vendido: "vendido",
};
