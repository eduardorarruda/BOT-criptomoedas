import {
  ConfiguracaoBacktestEsquema,
  mercadoDo,
  MS_POR_INTERVALO,
  type ConfiguracaoBacktest,
  type MetricasBacktest,
} from "@zentrade/contratos/esquemas";
import { avaliarTentativas, momentos } from "@zentrade/financas";
import type { Backtest, PontoCurvaBacktest } from "../api/esquemas";
import { criarAleatorio, normal } from "./aleatorio";
import { maiorQuedaDe, retornosDe, sharpeDe, validacaoDemo, type SerieDemo } from "./backtestDemoValidacao";
import { perfilWinDoPedido, resultadoDemoWin } from "./backtestDemoWin";

/**
 * Backtests do modo de demonstração: um mercado sintético, uma estratégia que entra e
 * sai dele com custos, e as mesmas métricas e validações do motor (em contas simples).
 * Determinístico pela semente: o exemplo sai igual a cada carregamento.
 */
export interface PerfilDemo {
  readonly semente: number;
  /** Tendência do mercado por barra e volatilidade por barra. */
  readonly deriva: number;
  readonly volatilidade: number;
  /** Vantagem por barra com posição: até `ateFracao` do período, e depois dele. */
  readonly vantagem: number;
  readonly vantagemDepois?: number;
  readonly ateFracao?: number;
  readonly chanceEntrada: number;
  readonly barras: number;
}

const ANO = 365 * 86_400_000;
/** Fração do patrimônio em cada posição (risco de 0,5% com stop de 2% ≈ 25%). */
const EXPOSICAO = 0.25;

interface Pedido {
  readonly inicio: number;
  readonly fim: number;
  readonly intervalo: Backtest["intervalo"];
}

function custoPorLado(c: ConfiguracaoBacktest) {
  const deslizamento = (c.custos.deslizamentoBps + c.custos.meioSpreadBps) / 10_000;
  return { taxa: c.custos.taxaPorLado, deslizamento };
}

/** O mercado e a estratégia, barra a barra. */
function simular(p: Pedido, perfil: PerfilDemo, c: ConfiguracaoBacktest) {
  const sortear = criarAleatorio(perfil.semente);
  const n = Math.max(
    30,
    Math.min(perfil.barras, Math.floor((p.fim - p.inicio) / MS_POR_INTERVALO[p.intervalo])),
  );
  const passo = (p.fim - p.inicio) / n;
  const { taxa, deslizamento } = custoPorLado(c);
  const capital = Number(c.saldoInicial ?? "1000");
  const s = { em: [] as number[], patrimonio: [] as number[], buyHold: [] as number[] };
  const operacoes: { abertaEm: number; fechadaEm: number; retorno: number; resultado: number }[] = [];
  const custos = { taxas: 0, deslizamento: 0, expostas: 0, stops: 0, alvos: 0 };
  let preco = 100;
  let valor = capital;
  let aberta: { em: number; valor: number; barras: number } | null = null;
  const bhQuantidade = (capital * (1 - taxa)) / (preco * (1 + deslizamento));
  for (let i = 0; i < n; i++) {
    const em = Math.round(p.inicio + (i + 1) * passo) - 1;
    const mercado = perfil.deriva + perfil.volatilidade * normal(sortear);
    preco *= 1 + mercado;
    if (aberta) {
      custos.expostas++;
      const vantagem =
        i / n < (perfil.ateFracao ?? 1) ? perfil.vantagem : (perfil.vantagemDepois ?? perfil.vantagem);
      valor *= 1 + EXPOSICAO * (mercado + vantagem);
      if (--aberta.barras <= 0) {
        const nocional = valor * EXPOSICAO;
        custos.taxas += nocional * taxa;
        custos.deslizamento += nocional * deslizamento;
        valor -= nocional * (taxa + deslizamento);
        const resultado = valor - aberta.valor;
        operacoes.push({ abertaEm: aberta.em, fechadaEm: em, retorno: resultado / aberta.valor, resultado });
        if (resultado < 0) custos.stops++;
        else custos.alvos++;
        aberta = null;
      }
    } else if (sortear() < perfil.chanceEntrada) {
      const nocional = valor * EXPOSICAO;
      custos.taxas += nocional * taxa;
      custos.deslizamento += nocional * deslizamento;
      aberta = { em, valor, barras: 2 + Math.floor(sortear() * 9) };
      valor -= nocional * (taxa + deslizamento);
    }
    s.em.push(em);
    s.patrimonio.push(valor);
    s.buyHold.push(bhQuantidade * preco);
  }
  const bhFinal = bhQuantidade * preco * (1 - deslizamento) * (1 - taxa);
  return { s, operacoes, custos, capital, bhFinal, porAno: ANO / passo, n };
}

const texto = (v: number) => v.toFixed(2);

function duracaoDaQueda(em: readonly number[], v: readonly number[]) {
  let pico = 0;
  let pior = { pico: 0, vale: 0, queda: 0 };
  v.forEach((x, i) => {
    if (x > (v[pico] ?? 0)) pico = i;
    const q = 1 - x / (v[pico] ?? x);
    if (q > pior.queda) pior = { pico, vale: i, queda: q };
  });
  const volta = v.findIndex((x, i) => i > pior.vale && x >= (v[pior.pico] ?? 0));
  const fim = em[volta === -1 ? em.length - 1 : volta] ?? 0;
  return { duracaoMaiorQuedaMs: Math.max(0, fim - (em[pior.pico] ?? 0)), maiorQuedaRecuperada: volta !== -1 };
}

function metricas(r: ReturnType<typeof simular>, p: Pedido, c: ConfiguracaoBacktest): MetricasBacktest {
  const { s, operacoes, custos, capital } = r;
  const final = s.patrimonio.at(-1) ?? capital;
  const liquido = final - capital;
  const retornos = retornosDe(capital, s.patrimonio);
  const m = momentos(retornos);
  const baixo = Math.sqrt(retornos.reduce((a, x) => a + Math.min(x, 0) ** 2, 0) / Math.max(1, m.n));
  const anos = (p.fim - p.inicio) / ANO;
  const queda = maiorQuedaDe([capital, ...s.patrimonio]);
  const cagr = anos >= 1 ? (final / capital) ** (1 / anos) - 1 : null;
  const ganhos = operacoes.filter((o) => o.resultado > 0).map((o) => o.resultado);
  const perdas = operacoes.filter((o) => o.resultado < 0).map((o) => o.resultado);
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const ganhoMedio = media(ganhos);
  const perdaMedia = media(perdas);
  const bhRetorno = r.bhFinal / capital - 1;
  const sharpe = sharpeDe(retornos, r.porAno);
  return {
    resultadoLiquido: texto(liquido),
    resultadoPercentual: liquido / capital,
    resultadoBruto: texto(liquido + custos.taxas + custos.deslizamento),
    resultadoBrutoPercentual: (liquido + custos.taxas + custos.deslizamento) / capital,
    patrimonioFinal: texto(final),
    maiorQueda: texto(queda * Math.max(...s.patrimonio, capital)),
    maiorQuedaPercentual: queda,
    operacoes: operacoes.length,
    acertos: ganhos.length,
    taxaAcerto: operacoes.length ? ganhos.length / operacoes.length : 0,
    taxasPagas: texto(custos.taxas),
    deslizamentoPago: texto(custos.deslizamento),
    ordens: operacoes.length * 2,
    saldoInicial: texto(capital),
    riscoPorOperacao: texto(capital * (c.risco.modo === "sem_limites" ? 0.01 : 0.005)),
    candles: r.n,
    cagr,
    volatilidadeAnual: m.desvio * Math.sqrt(r.porAno),
    sharpe,
    sortino: baixo > 0 ? (m.media / baixo) * Math.sqrt(r.porAno) : null,
    calmar: cagr !== null && queda > 0 ? cagr / queda : null,
    ...duracaoDaQueda(s.em, s.patrimonio),
    fatorLucro: perdas.length ? ganhos.reduce((a, b) => a + b, 0) / -perdas.reduce((a, b) => a + b, 0) : null,
    expectativa: texto(operacoes.length ? liquido / operacoes.length : 0),
    ganhoMedio: ganhoMedio === null ? null : texto(ganhoMedio),
    perdaMedia: perdaMedia === null ? null : texto(perdaMedia),
    payoff: ganhoMedio !== null && perdaMedia !== null ? ganhoMedio / -perdaMedia : null,
    tempoExposto: custos.expostas / r.n,
    buyHoldResultadoPercentual: bhRetorno,
    buyHoldMaiorQuedaPercentual: maiorQuedaDe([capital, ...s.buyHold]),
    buyHoldSharpe: sharpeDe(retornosDe(capital, s.buyHold), r.porAno),
    excessoSobreBuyHold: liquido / capital - bhRetorno,
    observacoes: m.n,
    barrasPorAno: r.porAno,
    assimetria: m.assimetria,
    curtose: m.curtose,
    anos,
    stopsIntrabar: custos.stops,
    alvosIntrabar: custos.alvos,
    candlesAmbiguos: Math.round(operacoes.length * 0.03),
    precisaoMinuto: c.precisaoMinuto,
  };
}

/** Resultado completo (métricas, curva com buy and hold e validação) para um pedido. */
export function resultadoDemo(
  p: Pedido,
  perfil: PerfilDemo,
  configuracao: ConfiguracaoBacktest,
): Pick<Backtest, "metricas" | "curva" | "validacao"> {
  const r = simular(p, perfil, configuracao);
  const serie: SerieDemo = { ...r.s, operacoes: r.operacoes, porAno: r.porAno, capital: r.capital };
  const passo = Math.max(1, Math.ceil(r.s.em.length / 400));
  const curva: PontoCurvaBacktest[] = r.s.em
    .map((em, i) => ({ em, patrimonio: texto(r.s.patrimonio[i] ?? 0), buyHold: texto(r.s.buyHold[i] ?? 0) }))
    .filter((_, i) => i % passo === 0 || i === r.s.em.length - 1);
  return {
    metricas: metricas(r, p, configuracao),
    curva,
    validacao: validacaoDemo(serie, p, configuracao.validacao, configuracao.risco.modo === "sem_limites"),
  };
}

/** Perfil de um pedido feito na tela: um pouco de vantagem, que às vezes some fora da amostra. */
function perfilDoPedido(b: Backtest): PerfilDemo {
  const semente = [...`${b.estrategiaId}${b.versao}${b.simbolo}${b.intervalo}`].reduce(
    (h, c) => (h * 31 + c.charCodeAt(0)) >>> 0,
    b.inicio % 997,
  );
  const sorte = criarAleatorio(semente);
  return {
    semente,
    deriva: (sorte() - 0.45) * 0.002,
    volatilidade: 0.008 + sorte() * 0.01,
    vantagem: 0.0004 + sorte() * 0.0012,
    vantagemDepois: sorte() < 0.4 ? -0.0008 : 0.0006,
    ateFracao: 0.7,
    chanceEntrada: 0.08 + sorte() * 0.1,
    barras: 1200,
  };
}

/** Resultado simulado de um backtest pedido na tela do exemplo (cripto ou mini índice). */
export function simularBacktest(pedido: Backtest, agora: number): Backtest {
  const configuracao = pedido.configuracao ?? ConfiguracaoBacktestEsquema.parse({});
  const perfil = perfilDoPedido(pedido);
  const resultado =
    mercadoDo(configuracao) === "win"
      ? resultadoDemoWin(pedido, perfilWinDoPedido(perfil.semente), configuracao)
      : resultadoDemo(pedido, perfil, configuracao);
  return { ...pedido, estado: "concluido", configuracao, ...resultado, concluidoEm: agora };
}

/** As tentativas de cada backtest, como a API calcula (todas as versões da estratégia, até ele). */
export function comTentativasDemo(lista: readonly Backtest[]): Backtest[] {
  return lista.map((b) => {
    const m = b.metricas;
    if (b.estado !== "concluido" || !m) return { ...b, tentativas: null };
    const anteriores = lista.filter(
      (x) => x.estado === "concluido" && x.estrategiaId === b.estrategiaId && x.criadoEm <= b.criadoEm,
    );
    const { tentativas: total, ...avaliacao } = avaliarTentativas(
      {
        sharpeAnual: m.sharpe ?? null,
        observacoes: m.observacoes ?? 0,
        assimetria: m.assimetria ?? 0,
        curtose: m.curtose ?? 3,
        barrasPorAno: m.barrasPorAno ?? 0,
        anos: m.anos ?? 0,
      },
      anteriores.map((x) => x.metricas?.sharpe ?? null),
    );
    return {
      ...b,
      tentativas: {
        total,
        daVersao: anteriores.filter((x) => x.versao === b.versao).length,
        versoes: new Set(anteriores.map((x) => x.versao)).size,
        ...avaliacao,
      },
    };
  });
}
