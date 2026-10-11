import { dec, type Valor } from "@zentrade/dominio";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";
import { diaUtc, exigirFracao, exigirNaoNegativo, razao, somar, ZERO } from "./imobiliario-comum.js";

/**
 * Imposto de renda sobre o ganho de capital da pessoa física na venda de imóvel.
 * É uma estimativa para planejar: o cálculo oficial é o do programa GCAP da Receita
 * Federal. As isenções dependem de fatos que só a pessoa conhece, por isso entram
 * como declarações (premissas), nunca como conselho.
 */
export interface FaixaGanhoCapital {
  /** Limite superior da faixa (inclusive); null na última, aberta. */
  readonly ate: Valor | null;
  readonly aliquota: number;
}

export interface TabelaGanhoCapital {
  readonly vigenteDesde: string;
  /** Quando a tabela foi conferida na fonte oficial. */
  readonly consultadaEm: string;
  readonly fonte: string;
  readonly faixas: readonly FaixaGanhoCapital[];
}

/**
 * Alíquotas progressivas do art. 21 da Lei 8.981/1995, na redação da Lei 13.259/2016,
 * para ganhos a partir de 1º/1/2017. Conferida em 11/10/2026 nas orientações da Receita
 * Federal (gov.br/receitafederal, "Ganhos de capital"). Se a lei mudar, passe outra
 * tabela para as funções em vez de editar esta.
 */
export const TABELA_GANHO_CAPITAL_PF: TabelaGanhoCapital = {
  vigenteDesde: "2017-01-01",
  consultadaEm: "2026-10-11",
  fonte: "Lei 8.981/1995, art. 21, redação da Lei 13.259/2016; Receita Federal, Ganhos de capital",
  faixas: [
    { ate: dec(5_000_000), aliquota: 0.15 },
    { ate: dec(10_000_000), aliquota: 0.175 },
    { ate: dec(30_000_000), aliquota: 0.2 },
    { ate: null, aliquota: 0.225 },
  ],
};

export interface IsencaoConhecida {
  readonly codigo: "pequeno_valor" | "unico_imovel" | "reinvestimento" | "antes_1970" | "reducao_1988";
  readonly descricao: string;
  readonly baseLegal: string;
}

/** O que a Receita lista como isenção ou redução, para mostrar como premissa. */
export const ISENCOES_GANHO_CAPITAL_IMOVEL: readonly IsencaoConhecida[] = [
  {
    codigo: "unico_imovel",
    descricao:
      "Venda, por até R$ 440.000,00, do único imóvel da pessoa, sem outra venda de imóvel nos 5 anos anteriores.",
    baseLegal: "Lei 9.250/1995, art. 23",
  },
  {
    codigo: "reinvestimento",
    descricao:
      "Venda de imóvel residencial com o dinheiro aplicado em outro imóvel residencial no Brasil em até 180 dias (isenção proporcional ao valor aplicado; uma vez a cada 5 anos; não vale para terreno nem vaga avulsa).",
    baseLegal: "Lei 11.196/2005, art. 39",
  },
  {
    codigo: "pequeno_valor",
    descricao: "Bem vendido por até R$ 35.000,00 no mês.",
    baseLegal: "Lei 9.250/1995, art. 22, redação da Lei 11.196/2005",
  },
  {
    codigo: "antes_1970",
    descricao: "Imóvel comprado até 1969.",
    baseLegal: "Lei 7.713/1988, art. 18",
  },
  {
    codigo: "reducao_1988",
    descricao: "Imóvel comprado de 1970 a 1988: redução de 5% do ganho por ano antes de 1989.",
    baseLegal: "Lei 7.713/1988, art. 18",
  },
];

export interface ImpostoPorFaixa {
  readonly de: Valor;
  readonly ate: Valor | null;
  readonly aliquota: number;
  readonly base: Valor;
  readonly imposto: Valor;
}

function validarTabela(t: TabelaGanhoCapital): void {
  const ultima = t.faixas[t.faixas.length - 1];
  if (!ultima || ultima.ate !== null) {
    throw new ErroParametroFinanceiro(
      "a tabela de ganho de capital precisa terminar numa faixa aberta (ate: null)",
    );
  }
  let anterior = ZERO;
  for (const f of t.faixas) {
    exigirFracao(f.aliquota, "a alíquota");
    if (f.ate !== null && f.ate.lte(anterior)) {
      throw new ErroParametroFinanceiro("as faixas da tabela precisam estar em ordem crescente");
    }
    if (f.ate !== null) anterior = f.ate;
  }
}

/** Imposto por faixas: cada alíquota incide só sobre a parcela do ganho dentro da faixa. */
export function impostoProgressivo(
  ganho: Valor,
  tabela: TabelaGanhoCapital = TABELA_GANHO_CAPITAL_PF,
): { imposto: Valor; porFaixa: ImpostoPorFaixa[]; aliquotaEfetiva: number | null } {
  validarTabela(tabela);
  const porFaixa: ImpostoPorFaixa[] = [];
  let de = ZERO;
  for (const f of tabela.faixas) {
    if (!ganho.gt(de)) break;
    const teto = f.ate === null || ganho.lt(f.ate) ? ganho : f.ate;
    const base = teto.minus(de);
    porFaixa.push({ de, ate: f.ate, aliquota: f.aliquota, base, imposto: base.times(f.aliquota) });
    if (f.ate === null) break;
    de = f.ate;
  }
  const imposto = somar(porFaixa.map((p) => p.imposto));
  return { imposto, porFaixa, aliquotaEfetiva: ganho.gt(0) ? razao(imposto, ganho) : null };
}

const PUBLICACAO_LEI_11196 = { ano: 2005, mes: 11 };
const INICIO_FR1 = { ano: 1996, mes: 1 };

interface Mes {
  readonly ano: number;
  readonly mes: number;
}

const mesDe = (iso: string): Mes => {
  const d = new Date(diaUtc(iso));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
};
const indice = (m: Mes): number => m.ano * 12 + (m.mes - 1);
const maior = (a: Mes, b: Mes): Mes => (indice(a) >= indice(b) ? a : b);
const menor = (a: Mes, b: Mes): Mes => (indice(a) <= indice(b) ? a : b);

/**
 * Fatores de redução do art. 40 da Lei 11.196/2005 (publicada em novembro de 2005):
 * FR1 = 1/1,0060^m1 (meses da compra — ou de jan/1996, se antes — até nov/2005);
 * FR2 = 1/1,0035^m2 (meses de dez/2005 — ou da compra, se depois — até a venda).
 * Meses contados pela diferença entre os meses-calendário (aproximação do GCAP).
 */
export function fatoresReducao(dataAquisicao: string, dataVenda: string) {
  const compra = mesDe(dataAquisicao);
  const venda = mesDe(dataVenda);
  if (indice(venda) < indice(compra))
    throw new ErroParametroFinanceiro("a venda não pode ser antes da compra");
  const fimFr1 = menor(PUBLICACAO_LEI_11196, venda);
  const m1 = Math.max(0, indice(fimFr1) - indice(maior(compra, INICIO_FR1)));
  const inicioFr2 = maior(compra, { ano: 2005, mes: 12 });
  const m2 = Math.max(0, indice(venda) - indice(inicioFr2));
  return { m1, fr1: 1 / Math.pow(1.006, m1), m2, fr2: 1 / Math.pow(1.0035, m2) };
}

export interface ParametrosGanhoCapitalImovel {
  readonly valorVenda: Valor;
  /** Corretagem paga por quem vende (deduzida do valor de venda). */
  readonly custosVenda?: Valor;
  /** Preço de compra + ITBI + escritura e registro. */
  readonly custoAquisicao: Valor;
  /** Reformas e benfeitorias comprovadas. */
  readonly benfeitorias?: Valor;
  readonly dataAquisicao: string;
  readonly dataVenda: string;
  /** FR1/FR2 da Lei 11.196/2005 (padrão: sim). */
  readonly aplicarFatoresReducao?: boolean;
  /** Declaração: valor aplicado em outro imóvel residencial em até 180 dias. */
  readonly valorReinvestido?: Valor;
  /** Declaração: é o único imóvel e não houve outra venda de imóvel em 5 anos. */
  readonly unicoImovel?: boolean;
  readonly tabela?: TabelaGanhoCapital;
}

export interface ReducaoAplicada {
  readonly motivo: string;
  readonly percentual: number;
  readonly valor: Valor;
}

export interface ResultadoGanhoCapital {
  readonly ganhoBruto: Valor;
  readonly reducoes: readonly ReducaoAplicada[];
  readonly ganhoTributavel: Valor;
  readonly isento: boolean;
  readonly motivosIsencao: readonly string[];
  readonly imposto: Valor;
  readonly aliquotaEfetiva: number | null;
  readonly porFaixa: readonly ImpostoPorFaixa[];
  readonly premissas: readonly string[];
}

const LIMITE_PEQUENO_VALOR = dec(35_000);
const LIMITE_UNICO_IMOVEL = dec(440_000);

function motivosDeIsencao(p: ParametrosGanhoCapitalImovel): string[] {
  const motivos: string[] = [];
  if (p.valorVenda.lte(LIMITE_PEQUENO_VALOR))
    motivos.push("Bem de pequeno valor: venda de até R$ 35.000,00.");
  if (p.unicoImovel && p.valorVenda.lte(LIMITE_UNICO_IMOVEL)) {
    motivos.push("Único imóvel vendido por até R$ 440.000,00 (declarado por você).");
  }
  if (mesDe(p.dataAquisicao).ano <= 1969) motivos.push("Imóvel comprado até 1969.");
  if (p.valorReinvestido?.gte(p.valorVenda)) {
    motivos.push("Todo o valor da venda aplicado em imóvel residencial em 180 dias (declarado por você).");
  }
  return motivos;
}

function reducoes(p: ParametrosGanhoCapitalImovel, ganho: Valor): ReducaoAplicada[] {
  const lista: ReducaoAplicada[] = [];
  let restante = ganho;
  const aplicar = (motivo: string, percentual: number): void => {
    if (percentual <= 0) return;
    const valor = restante.times(percentual);
    lista.push({ motivo, percentual, valor });
    restante = restante.minus(valor);
  };
  const ano = mesDe(p.dataAquisicao).ano;
  if (ano >= 1970 && ano <= 1988) aplicar("Redução da Lei 7.713/1988 (compra até 1988)", (1989 - ano) * 0.05);
  if (p.aplicarFatoresReducao ?? true) {
    const f = fatoresReducao(p.dataAquisicao, p.dataVenda);
    aplicar(`Fator de redução FR1 (${f.m1} meses)`, 1 - f.fr1);
    aplicar(`Fator de redução FR2 (${f.m2} meses)`, 1 - f.fr2);
  }
  if (p.valorReinvestido?.gt(0)) {
    aplicar(
      "Reinvestimento em imóvel residencial em 180 dias (proporcional)",
      p.valorReinvestido.div(p.valorVenda).toNumber(),
    );
  }
  return lista;
}

const PREMISSAS = [
  "Estimativa para planejamento; o cálculo oficial é o do programa GCAP da Receita Federal.",
  "Custo de aquisição = preço + ITBI + escritura e registro; benfeitorias só se comprovadas.",
  "Corretagem paga por quem vende reduz o valor de venda.",
  "Isenções dependem de fatos que você declara; confira as condições na Receita Federal.",
];

/** Ganho de capital e imposto estimado na venda de um imóvel por pessoa física. */
export function ganhoCapitalImovel(p: ParametrosGanhoCapitalImovel): ResultadoGanhoCapital {
  const venda = exigirNaoNegativo(p.valorVenda, "o valor de venda");
  const custo = somar([
    exigirNaoNegativo(p.custoAquisicao, "o custo de aquisição"),
    exigirNaoNegativo(p.benfeitorias ?? ZERO, "as benfeitorias"),
  ]);
  const ganhoBruto = venda.minus(exigirNaoNegativo(p.custosVenda ?? ZERO, "os custos de venda")).minus(custo);
  fatoresReducao(p.dataAquisicao, p.dataVenda);
  const motivos = motivosDeIsencao(p);
  const tabela = p.tabela ?? TABELA_GANHO_CAPITAL_PF;
  const premissas = [...PREMISSAS, `Alíquotas: ${tabela.fonte} (vigente desde ${tabela.vigenteDesde}).`];
  if (motivos.length > 0 || !ganhoBruto.gt(0)) {
    return {
      ganhoBruto,
      reducoes: [],
      ganhoTributavel: ZERO,
      isento: motivos.length > 0,
      motivosIsencao: motivos,
      imposto: ZERO,
      aliquotaEfetiva: null,
      porFaixa: [],
      premissas,
    };
  }
  const lista = reducoes(p, ganhoBruto);
  const ganhoTributavel = ganhoBruto.minus(somar(lista.map((r) => r.valor)));
  const calculo = impostoProgressivo(ganhoTributavel, tabela);
  return {
    ganhoBruto,
    reducoes: lista,
    ganhoTributavel,
    isento: false,
    motivosIsencao: [],
    imposto: calculo.imposto,
    aliquotaEfetiva: razao(calculo.imposto, ganhoBruto),
    porFaixa: calculo.porFaixa,
    premissas,
  };
}
