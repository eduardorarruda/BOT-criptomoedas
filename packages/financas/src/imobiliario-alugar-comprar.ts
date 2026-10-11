import { dec, type Valor } from "@zentrade/dominio";
import { tabelaAmortizacao, type ParametrosFinanciamento, type TabelaAmortizacao } from "./amortizacao.js";
import { ErroParametroFinanceiro, exigirTaxa, taxaMensalDeAnualFracao } from "./fluxo-caixa.js";
import {
  centavos,
  exigirFracao,
  exigirInteiro,
  exigirNaoNegativo,
  exigirPositivo,
  ZERO,
} from "./imobiliario-comum.js";

/**
 * Alugar × comprar com custo de oportunidade. Os dois cenários gastam o mesmo
 * dinheiro: quem compra paga entrada, custos, parcelas e custos do proprietário;
 * quem aluga aplica a entrada e os custos e paga o aluguel. Todo mês, quem gastou
 * menos aplica a diferença à taxa de oportunidade informada. Ao fim, compara o
 * patrimônio de cada um. É uma conta sob premissas, não uma recomendação.
 */
export type FinanciamentoSimulado = Omit<ParametrosFinanciamento, "valorFinanciado" | "custosIniciais">;

export interface ParametrosAlugarComprar {
  readonly valorImovel: Valor;
  readonly entrada: Valor;
  /** ITBI, escritura, registro e tarifas pagos na compra. */
  readonly custosCompra: Valor;
  /** Obrigatório quando a entrada é menor que o valor do imóvel. */
  readonly financiamento?: FinanciamentoSimulado;
  readonly aluguelMensal: Valor;
  /** Reajuste anual do aluguel e dos custos do proprietário. */
  readonly reajusteAnual: number;
  /** IPTU, manutenção, seguro: o que só o proprietário paga (condomínio costuma ser igual nos dois). */
  readonly custosProprietarioMensais: Valor;
  readonly valorizacaoAnual: number;
  /** Rendimento do dinheiro aplicado (informe já líquido de IR, se quiser). */
  readonly taxaOportunidadeAnual: number;
  readonly horizonteMeses: number;
  /** Corretagem para vender o imóvel no fim e comparar em dinheiro (padrão 0). */
  readonly custoVendaFinal?: number;
}

export interface MesAlugarComprar {
  readonly mes: number;
  readonly gastoComprar: Valor;
  readonly gastoAlugar: Valor;
  readonly valorImovel: Valor;
  readonly saldoDevedor: Valor;
  readonly patrimonioComprar: Valor;
  readonly patrimonioAlugar: Valor;
}

export interface ResultadoAlugarComprar {
  readonly meses: readonly MesAlugarComprar[];
  readonly final: {
    readonly comprar: Valor;
    readonly alugar: Valor;
    /** Comprar − alugar. */
    readonly diferenca: Valor;
    readonly maiorPatrimonio: "comprar" | "alugar" | "igual";
  };
  /** Primeiro mês em que o patrimônio de quem compra alcança o de quem aluga. */
  readonly mesEmQueComprarAlcanca: number | null;
  readonly premissas: readonly string[];
}

export const HORIZONTE_MAXIMO_MESES = 600;

function tabelaDoCenario(p: ParametrosAlugarComprar): TabelaAmortizacao | null {
  exigirPositivo(p.valorImovel, "o valor do imóvel");
  exigirNaoNegativo(p.entrada, "a entrada");
  if (p.entrada.gt(p.valorImovel)) {
    throw new ErroParametroFinanceiro("a entrada não pode passar do valor do imóvel");
  }
  const financiado = p.valorImovel.minus(p.entrada);
  if (financiado.isZero()) return null;
  if (!p.financiamento) {
    throw new ErroParametroFinanceiro("com entrada menor que o valor do imóvel, informe o financiamento");
  }
  return tabelaAmortizacao({ ...p.financiamento, valorFinanciado: financiado });
}

function validar(p: ParametrosAlugarComprar): void {
  exigirInteiro(p.horizonteMeses, "o horizonte em meses", 1, HORIZONTE_MAXIMO_MESES);
  exigirNaoNegativo(p.custosCompra, "os custos de compra");
  exigirNaoNegativo(p.aluguelMensal, "o aluguel");
  exigirNaoNegativo(p.custosProprietarioMensais, "os custos do proprietário");
  exigirTaxa(p.reajusteAnual, "o reajuste anual");
  exigirTaxa(p.valorizacaoAnual, "a valorização anual");
  exigirFracao(p.custoVendaFinal ?? 0, "o custo de venda");
}

const PREMISSAS = [
  "Os dois cenários gastam o mesmo: todo mês, quem gasta menos aplica a diferença.",
  "O dinheiro aplicado rende a taxa de oportunidade informada, todo mês, sem resgates.",
  "Aluguel e custos do proprietário reajustam uma vez por ano pela taxa informada.",
  "O imóvel valoriza à taxa anual informada, composta mês a mês.",
  "Parcelas sem correção monetária; condomínio fora da conta (costuma ser igual nos dois).",
];

function simularMeses(p: ParametrosAlugarComprar, tabela: TabelaAmortizacao | null): MesAlugarComprar[] {
  const rendimento = dec(
    1 + taxaMensalDeAnualFracao(exigirTaxa(p.taxaOportunidadeAnual, "a taxa de oportunidade")),
  );
  const valorizacaoMensal = dec(1 + taxaMensalDeAnualFracao(p.valorizacaoAnual));
  const liquidoVenda = dec(1).minus(p.custoVendaFinal ?? 0);
  let carteiraComprar = ZERO;
  let carteiraAlugar = p.entrada.plus(p.custosCompra);
  let valorImovel = p.valorImovel;
  const meses: MesAlugarComprar[] = [];
  for (let mes = 1; mes <= p.horizonteMeses; mes++) {
    const reajuste = dec(1 + p.reajusteAnual).pow(Math.floor((mes - 1) / 12));
    const linha = tabela?.linhas[mes - 1];
    const gastoComprar = centavos(p.custosProprietarioMensais.times(reajuste)).plus(
      linha?.parcelaTotal ?? ZERO,
    );
    const gastoAlugar = centavos(p.aluguelMensal.times(reajuste));
    const diferenca = gastoComprar.minus(gastoAlugar);
    carteiraComprar = carteiraComprar.times(rendimento).plus(diferenca.isNegative() ? diferenca.neg() : ZERO);
    carteiraAlugar = carteiraAlugar.times(rendimento).plus(diferenca.isNegative() ? ZERO : diferenca);
    valorImovel = valorImovel.times(valorizacaoMensal);
    const saldoDevedor = linha?.saldoFinal ?? ZERO;
    meses.push({
      mes,
      gastoComprar,
      gastoAlugar,
      valorImovel: centavos(valorImovel),
      saldoDevedor,
      patrimonioComprar: centavos(valorImovel.times(liquidoVenda).minus(saldoDevedor).plus(carteiraComprar)),
      patrimonioAlugar: centavos(carteiraAlugar),
    });
  }
  return meses;
}

/** Simula mês a mês e compara o patrimônio de quem compra com o de quem aluga. */
export function alugarOuComprar(p: ParametrosAlugarComprar): ResultadoAlugarComprar {
  validar(p);
  const meses = simularMeses(p, tabelaDoCenario(p));
  const alcanca = meses.find((m) => m.patrimonioComprar.gte(m.patrimonioAlugar))?.mes ?? null;
  const ultimo = meses[meses.length - 1] as MesAlugarComprar;
  const diferenca = ultimo.patrimonioComprar.minus(ultimo.patrimonioAlugar);
  return {
    meses,
    final: {
      comprar: ultimo.patrimonioComprar,
      alugar: ultimo.patrimonioAlugar,
      diferenca,
      maiorPatrimonio: diferenca.isZero() ? "igual" : diferenca.isNegative() ? "alugar" : "comprar",
    },
    mesEmQueComprarAlcanca: alcanca,
    premissas: PREMISSAS,
  };
}
