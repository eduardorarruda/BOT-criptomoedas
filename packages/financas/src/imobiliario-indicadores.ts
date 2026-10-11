import { dec, type Valor } from "@zentrade/dominio";
import { ErroParametroFinanceiro, exigirTaxa } from "./fluxo-caixa.js";
import {
  exigirFracao,
  exigirInteiro,
  exigirNaoNegativo,
  exigirPositivo,
  razao,
  somar,
  ZERO,
} from "./imobiliario-comum.js";

/**
 * Indicadores de imóveis e FIIs. São fatos calculados a partir dos números
 * informados: não dizem se o investimento é bom ou ruim. Frações em `number`
 * (0,06 = 6%); dinheiro em Valor.
 */

/** Cap rate: renda operacional líquida anual (NOI) / valor do imóvel. */
export const capRate = (noiAnual: Valor, valorImovel: Valor): number | null => razao(noiAnual, valorImovel);

/** Cash-on-cash: fluxo de caixa anual (depois das parcelas) / dinheiro próprio investido. */
export const cashOnCash = (fluxoCaixaAnual: Valor, capitalProprio: Valor): number | null =>
  razao(fluxoCaixaAnual, capitalProprio);

/** Yield bruto anual: aluguel × 12 / valor do imóvel. */
export const yieldBruto = (aluguelMensal: Valor, valorImovel: Valor): number | null =>
  razao(aluguelMensal.times(12), valorImovel);

/** Despesas mensais do proprietário (o que o inquilino paga não entra). */
export interface DespesasMensais {
  readonly condominio?: Valor;
  readonly iptu?: Valor;
  readonly manutencao?: Valor;
  readonly seguro?: Valor;
  readonly outras?: Valor;
}

export interface ParametrosRenda {
  readonly aluguelMensal: Valor;
  /** Fração do tempo sem inquilino (1/12 = um mês por ano). */
  readonly vacancia?: number;
  /** Taxa da administradora sobre o aluguel recebido. */
  readonly taxaAdministracao?: number;
  readonly despesas?: DespesasMensais;
}

export interface RendaMensal {
  readonly aluguelBruto: Valor;
  readonly perdaVacancia: Valor;
  readonly receitaEfetiva: Valor;
  readonly administracao: Valor;
  readonly despesas: Valor;
  readonly liquido: Valor;
}

export function somarDespesas(d: DespesasMensais = {}): Valor {
  const itens = [d.condominio, d.iptu, d.manutencao, d.seguro, d.outras].filter(
    (v): v is Valor => v !== undefined,
  );
  return somar(itens.map((v) => exigirNaoNegativo(v, "a despesa")));
}

/** Aluguel − vacância − administração − despesas do proprietário, por mês. */
export function rendimentoMensalLiquido(p: ParametrosRenda): RendaMensal {
  const aluguel = exigirNaoNegativo(p.aluguelMensal, "o aluguel");
  const perdaVacancia = aluguel.times(exigirFracao(p.vacancia ?? 0, "a vacância"));
  const receitaEfetiva = aluguel.minus(perdaVacancia);
  const administracao = receitaEfetiva.times(
    exigirFracao(p.taxaAdministracao ?? 0, "a taxa de administração"),
  );
  const despesas = somarDespesas(p.despesas);
  return {
    aluguelBruto: aluguel,
    perdaVacancia,
    receitaEfetiva,
    administracao,
    despesas,
    liquido: receitaEfetiva.minus(administracao).minus(despesas),
  };
}

/** Yield líquido anual: rendimento mensal líquido × 12 / valor do imóvel. */
export const yieldLiquido = (p: ParametrosRenda, valorImovel: Valor): number | null =>
  razao(rendimentoMensalLiquido(p).liquido.times(12), valorImovel);

export interface ParametrosTemporada {
  readonly diaria: Valor;
  /** Fração das noites do mês ocupadas. */
  readonly ocupacao: number;
  readonly diasNoMes?: number;
  /** Comissão da plataforma sobre a receita bruta. */
  readonly taxaPlataforma?: number;
  /** Limpeza, enxoval, consumo: custo por noite ocupada. */
  readonly custoPorNoite?: Valor;
  readonly despesasMensais?: Valor;
}

export interface RendaTemporada {
  readonly noitesOcupadas: number;
  readonly receitaBruta: Valor;
  readonly taxaPlataforma: Valor;
  readonly custosVariaveis: Valor;
  readonly despesas: Valor;
  readonly liquido: Valor;
}

/** Receita de aluguel por temporada num mês típico, com as premissas de ocupação. */
export function receitaTemporada(p: ParametrosTemporada): RendaTemporada {
  const dias = exigirInteiro(p.diasNoMes ?? 30, "os dias do mês", 28, 31);
  const noites = dec(exigirFracao(p.ocupacao, "a ocupação")).times(dias);
  const receitaBruta = exigirNaoNegativo(p.diaria, "a diária").times(noites);
  const taxaPlataforma = receitaBruta.times(exigirFracao(p.taxaPlataforma ?? 0, "a taxa da plataforma"));
  const custosVariaveis = exigirNaoNegativo(p.custoPorNoite ?? ZERO, "o custo por noite").times(noites);
  const despesas = exigirNaoNegativo(p.despesasMensais ?? ZERO, "as despesas");
  return {
    noitesOcupadas: noites.toNumber(),
    receitaBruta,
    taxaPlataforma,
    custosVariaveis,
    despesas,
    liquido: receitaBruta.minus(taxaPlataforma).minus(custosVariaveis).minus(despesas),
  };
}

/** Valor × (1 + taxa)^anos. Premissa: a mesma taxa todo ano. */
export function valorizacaoComposta(valor: Valor, taxaAnual: number, anos: number): Valor {
  exigirTaxa(taxaAnual, "a valorização anual");
  if (!Number.isFinite(anos) || anos < 0)
    throw new ErroParametroFinanceiro("os anos não podem ser negativos");
  return valor.times(dec(1 + taxaAnual).pow(anos));
}

/** Taxa anual composta que leva `inicial` a `final` em `anos` (CAGR). */
export function taxaValorizacaoAnual(inicial: Valor, final: Valor, anos: number): number {
  exigirPositivo(inicial, "o valor inicial");
  exigirNaoNegativo(final, "o valor final");
  if (!Number.isFinite(anos) || anos <= 0)
    throw new ErroParametroFinanceiro("os anos precisam ser maiores que zero");
  return final.div(inicial).pow(dec(1).div(anos)).minus(1).toNumber();
}

/** Renda mensal de um FII: cotas × rendimento por cota. */
export function rendaFii(cotas: number, rendimentoPorCota: Valor): Valor {
  exigirInteiro(cotas, "as cotas", 0, Number.MAX_SAFE_INTEGER);
  return exigirNaoNegativo(rendimentoPorCota, "o rendimento por cota").times(cotas);
}

/** Dividend yield: rendimentos pagos por cota em 12 meses / preço da cota. */
export const dividendYield = (rendimentos12mPorCota: Valor, precoCota: Valor): number | null =>
  razao(rendimentos12mPorCota, precoCota);

/** Quantas cotas inteiras dão pelo menos a renda mensal alvo (premissa: rendimento constante). */
export function cotasParaRenda(rendaMensalAlvo: Valor, rendimentoPorCota: Valor): number {
  exigirPositivo(rendimentoPorCota, "o rendimento por cota");
  return exigirNaoNegativo(rendaMensalAlvo, "a renda alvo").div(rendimentoPorCota).ceil().toNumber();
}

export interface ParametrosFlip {
  readonly precoCompra: Valor;
  /** ITBI, escritura, registro. */
  readonly custosAquisicao: Valor;
  readonly reforma: Valor;
  /** Condomínio, IPTU, contas enquanto o imóvel não é vendido. */
  readonly custosMensais: Valor;
  readonly prazoMeses: number;
  readonly precoVenda: Valor;
  /** Corretagem sobre o preço de venda. */
  readonly corretagemVenda: number;
  /** Imposto sobre o ganho (calcule com ganhoCapitalImovel). */
  readonly impostoEstimado?: Valor;
}

export interface ResultadoFlip {
  readonly investimentoTotal: Valor;
  readonly receitaLiquidaVenda: Valor;
  readonly resultadoBruto: Valor;
  readonly resultadoLiquido: Valor;
  readonly margemSobreInvestido: number | null;
  /** Taxa mensal composta equivalente ao resultado líquido no prazo. */
  readonly rentabilidadeMensal: number | null;
}

/** Resultado de comprar, reformar e revender, sem financiamento. */
export function resultadoFlip(p: ParametrosFlip): ResultadoFlip {
  const prazo = exigirInteiro(p.prazoMeses, "o prazo em meses", 1, 600);
  const investimentoTotal = somar([
    exigirPositivo(p.precoCompra, "o preço de compra"),
    exigirNaoNegativo(p.custosAquisicao, "os custos de aquisição"),
    exigirNaoNegativo(p.reforma, "a reforma"),
    exigirNaoNegativo(p.custosMensais, "os custos mensais").times(prazo),
  ]);
  const venda = exigirNaoNegativo(p.precoVenda, "o preço de venda");
  const receitaLiquidaVenda = venda.minus(venda.times(exigirFracao(p.corretagemVenda, "a corretagem")));
  const resultadoBruto = receitaLiquidaVenda.minus(investimentoTotal);
  const resultadoLiquido = resultadoBruto.minus(exigirNaoNegativo(p.impostoEstimado ?? ZERO, "o imposto"));
  const margem = razao(resultadoLiquido, investimentoTotal);
  return {
    investimentoTotal,
    receitaLiquidaVenda,
    resultadoBruto,
    resultadoLiquido,
    margemSobreInvestido: margem,
    rentabilidadeMensal:
      margem === null || margem <= -1
        ? null
        : dec(1 + margem)
            .pow(dec(1).div(prazo))
            .minus(1)
            .toNumber(),
  };
}
