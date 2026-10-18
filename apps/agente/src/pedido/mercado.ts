import { MS_POR_INTERVALO, type Intervalo, type PedidoAnalise, type VelasPedido } from "@zentrade/contratos";
import { atr, ema, horaB3, volumeRelativo, vwapDoDia, type SerieHLC } from "@zentrade/dominio";
import { duracao, num, pct, preco as fmtPreco } from "./formato.js";

const PERIODO_ATR = 14;
/** Janelas da faixa recente, em velas do robô (em 5 min: 4 h e 24 h). */
const JANELAS_FAIXA = [48, 288] as const;
const MAIORES: readonly Intervalo[] = ["1h", "4h", "1d"];
/** EMA(9) agora e 3 velas atrás: precisa de 12 velas do tempo gráfico maior. */
const PERIODO_EMA = 9;
const PASSOS_INCLINACAO = 3;
const MINIMO_MAIOR = PERIODO_EMA + PASSOS_INCLINACAO;
/** Inclinação da EMA abaixo disso (por 3 velas) é "de lado". */
const DE_LADO = 0.001;

export interface LeituraMercado {
  readonly linhas: readonly string[];
  /** ATR(14) atual, para medir o stop em ATR. */
  readonly atr: number | null;
}

const velasValidas = (p: PedidoAnalise): VelasPedido | null =>
  p.velas && p.velas.instantes.length === p.fechamentos.length ? p.velas : null;

function regimeDeVolatilidade(
  hlc: SerieHLC,
  preco: number,
  intervalo: Intervalo,
): [string | null, number | null] {
  const serie: number[] = [];
  for (let d = 0; d < hlc.fechamentos.length; d++) {
    const v = atr(hlc, PERIODO_ATR, d);
    if (v === null) break;
    serie.push(v);
  }
  const atual = serie[0];
  if (atual === undefined) return [null, null];
  const percentil = Math.round((100 * serie.filter((v) => v <= atual).length) / serie.length);
  const media = serie.reduce((s, v) => s + v, 0) / serie.length;
  const regime = percentil >= 80 ? "alta" : percentil <= 20 ? "baixa" : "normal";
  return [
    `ATR(${PERIODO_ATR}): ${fmtPreco(atual)} (${pct(atual / preco, 3)} do preço); percentil ${percentil} das últimas ${serie.length} velas (${duracao(serie.length, intervalo)}), média ${fmtPreco(media)}: volatilidade ${regime} para esta janela.`,
    atual,
  ];
}

function faixas(v: VelasPedido, preco: number, intervalo: Intervalo): string[] {
  const n = v.maximas.length;
  const janelas = JANELAS_FAIXA.filter((j) => j <= n);
  return (janelas.length > 0 ? janelas : [n]).map((j) => {
    const maxima = Math.max(...v.maximas.slice(-j));
    const minima = Math.min(...v.minimas.slice(-j));
    const posicao = maxima > minima ? (preco - minima) / (maxima - minima) : 0.5;
    return `Faixa das últimas ${j} velas (${duracao(j, intervalo)}): ${fmtPreco(minima)}–${fmtPreco(maxima)} (amplitude ${pct((maxima - minima) / minima)}); preço em ${num(posicao * 100, 0)}% da faixa.`;
  });
}

/** Fechamentos agrupados de trás para frente em velas de `k` (a última fecha agora). */
function agrupar(fechamentos: readonly number[], k: number): number[] {
  const grupos = Math.floor(fechamentos.length / k);
  return Array.from(
    { length: grupos },
    (_, g) => fechamentos[fechamentos.length - 1 - (grupos - 1 - g) * k] as number,
  );
}

function tempoGraficoMaior(fechamentos: readonly number[], preco: number, intervalo: Intervalo): string[] {
  const base = MS_POR_INTERVALO[intervalo];
  const maiores = MAIORES.filter((m) => MS_POR_INTERVALO[m] > base && MS_POR_INTERVALO[m] % base === 0).slice(
    0,
    2,
  );
  return maiores.map((m) => {
    const fechos = agrupar(fechamentos, MS_POR_INTERVALO[m] / base);
    if (fechos.length < MINIMO_MAIOR)
      return `${m}: só ${fechos.length} velas no histórico (precisa de ${MINIMO_MAIOR}): sem leitura (MOTOR_HISTORICO maior resolve).`;
    const agora = ema(fechos, PERIODO_EMA) as number;
    const antes = ema(fechos, PERIODO_EMA, PASSOS_INCLINACAO) as number;
    const inclinacao = (agora - antes) / antes;
    const direcao = inclinacao > DE_LADO ? "subindo" : inclinacao < -DE_LADO ? "caindo" : "de lado";
    const distancia = (preco - agora) / agora;
    const lenta = ema(fechos, 21);
    const cruzamento = lenta === null ? "" : `; EMA(9) ${agora >= lenta ? "acima" : "abaixo"} da EMA(21)`;
    return `${m} (${fechos.length} velas): EMA(${PERIODO_EMA}) ${direcao} (${inclinacao >= 0 ? "+" : "−"}${pct(Math.abs(inclinacao), 3)} em ${PASSOS_INCLINACAO} velas); preço ${pct(Math.abs(distancia))} ${distancia >= 0 ? "acima" : "abaixo"} da EMA(${PERIODO_EMA})${cruzamento}.`;
  });
}

/** A fase do pregão do WIN (America/Sao_Paulo; nota 02 da base). */
function fasePregao(minutos: number): string {
  const h = (hhmm: number) => Math.floor(hhmm / 100) * 60 + (hhmm % 100);
  if (minutos < h(900) || minutos >= h(1825)) return "fora do pregão";
  if (minutos < h(1000)) return "abertura (primeira hora, mais volátil e com mais deslizamento)";
  if (minutos < h(1200)) return "manhã";
  if (minutos < h(1400)) return "almoço (liquidez menor)";
  if (minutos < h(1700)) return "tarde";
  return "fechamento (perto da zeragem)";
}

function pregaoEVwap(p: PedidoAnalise, v: VelasPedido | null, agoraMs: number, preco: number): string[] {
  const { minutos } = horaB3(agoraMs);
  const hhmm = `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
  const linhas = [`Pregão da B3: ${hhmm} de Brasília, ${fasePregao(minutos)}.`];
  const vwap = v ? vwapDoDia({ fechamentos: p.fechamentos, ...v }) : null;
  if (vwap === null) return [...linhas, "VWAP do dia: sem as velas do começo do dia."];
  const pontos = preco - vwap;
  return [
    ...linhas,
    `VWAP do dia: ${fmtPreco(vwap)}; preço ${num(Math.abs(pontos), 0)} pontos (${pct(Math.abs(pontos) / vwap)}) ${pontos >= 0 ? "acima" : "abaixo"}.`,
  ];
}

/**
 * O que um trader olha antes de entrar, calculado no código a partir das velas que o
 * motor já tem: volatilidade e regime, faixa recente, volume, tempo gráfico maior e,
 * no WIN, a fase do pregão e o VWAP do dia. Números, não opinião.
 */
export function leituraDoMercado(pedido: PedidoAnalise, agoraMs: number): LeituraMercado {
  const preco = pedido.preco.toNumber();
  const { intervalo } = pedido.robo;
  const v = velasValidas(pedido);
  const linhas: string[] = [];
  let atrAtual: number | null = null;
  if (v) {
    const hlc: SerieHLC = { maximas: v.maximas, minimas: v.minimas, fechamentos: pedido.fechamentos };
    const [linha, valor] = regimeDeVolatilidade(hlc, preco, intervalo);
    atrAtual = valor;
    if (linha) linhas.push(linha);
    linhas.push(...faixas(v, preco, intervalo));
    const relativo = volumeRelativo(v.volumes, 20);
    if (relativo !== null) linhas.push(`Volume da última vela: ${num(relativo, 1)} × a média de 20.`);
  } else {
    linhas.push(
      "Velas: o motor mandou só os fechamentos (sem máximas, mínimas e volumes): ATR, faixa e volume indisponíveis.",
    );
  }
  const maior = tempoGraficoMaior(pedido.fechamentos, preco, intervalo);
  if (maior.length > 0)
    linhas.push("Tempo gráfico maior (agrupado das velas do robô):", ...maior.map((l) => `  ${l}`));
  if (pedido.operacao?.custos.mercado === "win") linhas.push(...pregaoEVwap(pedido, v, agoraMs, preco));
  return { linhas, atr: atrAtual };
}
