import type { MoedaCarteira, OrigemNegociacao, ResumoCarteira } from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import { livroDe } from "./livro.js";
import { movimentosDe } from "./movimentos.js";
import { dinheiro, fracao, parcelaDto, resumoParcela, valoresDe, type ValoresParcela } from "./parcela.js";
import { USDT, type Movimento, type Negociacao, type SaldoConta } from "./tipos.js";

export interface EntradaCarteira {
  readonly negociacoes: readonly Negociacao[];
  readonly saldos: ReadonlyMap<string, SaldoConta>;
  /** Preço atual de cada moeda em USDT (USDT vale 1 mesmo se faltar aqui). */
  readonly precos: ReadonlyMap<string, Valor>;
}

export interface ResultadoCarteira {
  readonly moedas: MoedaCarteira[];
  readonly resumo: ResumoCarteira;
  readonly avisos: string[];
}

interface MoedaCalculada {
  readonly dto: MoedaCarteira;
  readonly robo: ValoresParcela;
  readonly manual: ValoresParcela;
  readonly total: ValoresParcela;
  readonly valorSaldo: Valor | null;
  readonly valorSemCusto: Valor | null;
}

const ZERO = dec(0);
const SALDO_ZERO: SaldoConta = { livre: ZERO, bloqueado: ZERO };
const maximo = (a: Valor, b: Valor): Valor => (a.gte(b) ? a : b);
/** Quantidade para a frase: até 8 casas, vírgula decimal (formatarNumero cortaria em 4). */
const qtd = (v: Valor): string => paraTexto(v.toDecimalPlaces(8)).replace(".", ",");

/** Movimentos por moeda, na ordem do tempo (e do id, no mesmo milissegundo). */
function movimentosPorMoeda(negociacoes: readonly Negociacao[]): Map<string, Movimento[]> {
  const ordenadas = [...negociacoes].sort((a, b) => a.em - b.em || a.id.localeCompare(b.id));
  const mapa = new Map<string, Movimento[]>();
  for (const m of ordenadas.flatMap(movimentosDe)) mapa.set(m.ativo, [...(mapa.get(m.ativo) ?? []), m]);
  return mapa;
}

const daOrigem = (ms: readonly Movimento[], o: OrigemNegociacao) => ms.filter((m) => m.origem === o);

function avisosDaMoeda(
  ativo: string,
  c: Omit<MoedaCalculada, "dto">,
  semCusto: Valor,
  fora: Valor,
): string[] {
  const { total, robo, manual } = c;
  const avisos: string[] = [];
  if (semCusto.gt(0))
    avisos.push(
      `${qtd(semCusto)} ${ativo} no saldo sem negociação que explique (depósito ou transferência): custo desconhecido, fora do preço médio e do resultado.`,
    );
  if (fora.gt(0))
    avisos.push(
      `As negociações somam ${qtd(fora)} ${ativo} a mais que o saldo (saque, Earn ou transferência). O resultado considera a posição das negociações.`,
    );
  if (total.livro.semConversao > 0)
    avisos.push(
      `${total.livro.semConversao} negociação(ões) sem conversão para USDT no instante: ficaram fora do cálculo.`,
    );
  if (total.livro.taxasSemConversao > 0)
    avisos.push(
      `${total.livro.taxasSemConversao} taxa(s) sem preço em USDT no instante: o total de taxas está incompleto.`,
    );
  if (total.livro.vendidoSemCusto.gt(0))
    avisos.push(
      `Venda de ${qtd(total.livro.vendidoSemCusto)} ${ativo} além do que foi comprado: sem custo, fora do resultado.`,
    );
  else if (robo.livro.vendidoSemCusto.gt(0) || manual.livro.vendidoSemCusto.gt(0))
    avisos.push(
      "Houve venda de moeda comprada pela outra parcela (robô e manual): cada parcela tem o próprio preço médio, então a soma das duas difere do total.",
    );
  return avisos;
}

function calcularMoeda(
  ativo: string,
  ms: readonly Movimento[],
  saldo: SaldoConta,
  preco: Valor | null,
): MoedaCalculada {
  const referencia = ativo === USDT;
  const valores = (lista: readonly Movimento[]) => valoresDe(livroDe(referencia ? [] : lista), preco);
  const robo = valores(daOrigem(ms, "robo"));
  const manual = valores(daOrigem(ms, "manual"));
  const total = valores(ms);
  const saldoTotal = saldo.livre.plus(saldo.bloqueado);
  const diferenca = referencia ? ZERO : saldoTotal.minus(total.livro.quantidade);
  const semCusto = maximo(diferenca, ZERO);
  const fora = maximo(diferenca.neg(), ZERO);
  // Quantidade zero vale zero mesmo sem preço; com quantidade e sem preço, valor desconhecido.
  const valorDe = (q: Valor): Valor | null => (q.isZero() ? ZERO : preco ? q.times(preco) : null);
  const valorSaldo = valorDe(saldoTotal);
  const valorSemCusto = valorDe(semCusto);
  const parcial = { robo, manual, total, valorSaldo, valorSemCusto };
  const dto: MoedaCarteira = {
    ativo,
    preco: preco ? dinheiro(preco) : null,
    referencia,
    saldo: {
      livre: dinheiro(saldo.livre),
      bloqueado: dinheiro(saldo.bloqueado),
      total: dinheiro(saldoTotal),
    },
    valorSaldo: valorSaldo ? dinheiro(valorSaldo) : null,
    quantidadeSemCusto: dinheiro(semCusto),
    valorSemCusto: valorSemCusto ? dinheiro(valorSemCusto) : null,
    quantidadeForaDoSaldo: dinheiro(fora),
    alocacao: null,
    robo: parcelaDto(robo),
    manual: parcelaDto(manual),
    total: parcelaDto(total),
    avisos: avisosDaMoeda(ativo, parcial, semCusto, fora),
  };
  return { ...parcial, dto };
}

function comAlocacao(m: MoedaCalculada, valorConta: Valor): MoedaCarteira {
  const alocacao = m.valorSaldo && valorConta.gt(0) ? fracao(m.valorSaldo.div(valorConta)) : null;
  return { ...m.dto, alocacao };
}

function ordenar(a: MoedaCalculada, b: MoedaCalculada): number {
  if (a.valorSaldo && b.valorSaldo)
    return b.valorSaldo.comparedTo(a.valorSaldo) || a.dto.ativo.localeCompare(b.dto.ativo);
  if (a.valorSaldo || b.valorSaldo) return a.valorSaldo ? -1 : 1;
  return a.dto.ativo.localeCompare(b.dto.ativo);
}

/**
 * A carteira inteira, por moeda e no total, separando robô × manual. Cálculo puro:
 * mesmas negociações, saldos e preços dão sempre o mesmo resultado.
 */
export function calcularCarteira(e: EntradaCarteira): ResultadoCarteira {
  const porMoeda = movimentosPorMoeda(e.negociacoes);
  const ativos = [...new Set([...e.saldos.keys(), ...porMoeda.keys()])];
  const precoDe = (a: string) => (a === USDT ? dec(1) : (e.precos.get(a) ?? null));
  const calculadas = ativos
    .map((a) => calcularMoeda(a, porMoeda.get(a) ?? [], e.saldos.get(a) ?? SALDO_ZERO, precoDe(a)))
    .sort(ordenar);
  const somar = (f: (m: MoedaCalculada) => Valor | null) =>
    calculadas.reduce((t, m) => t.plus(f(m) ?? ZERO), ZERO);
  const valorConta = somar((m) => m.valorSaldo);
  const naoReferencia = calculadas.filter((m) => !m.dto.referencia);
  const semPreco = calculadas.filter((m) => m.valorSaldo === null).map((m) => m.dto.ativo);
  const caixa = e.saldos.get(USDT) ?? SALDO_ZERO;
  return {
    moedas: calculadas.map((m) => comAlocacao(m, valorConta)),
    resumo: {
      robo: resumoParcela(naoReferencia.map((m) => m.robo)),
      manual: resumoParcela(naoReferencia.map((m) => m.manual)),
      total: resumoParcela(naoReferencia.map((m) => m.total)),
      valorConta: dinheiro(valorConta),
      valorSemCusto: dinheiro(somar((m) => m.valorSemCusto)),
      caixa: dinheiro(caixa.livre.plus(caixa.bloqueado)),
    },
    avisos:
      semPreco.length > 0
        ? [
            `Sem preço em USDT na Binance: ${semPreco.join(", ")}. Ficam fora do valor da conta e da alocação.`,
          ]
        : [],
  };
}
