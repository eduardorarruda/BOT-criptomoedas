import type { DecisaoDTO, OrdemDTO, PropostaAgente } from "@zentrade/contratos";
import { dec, precoAlvo, precoStop } from "@zentrade/dominio";
import type { Backtest, PontoPatrimonio } from "../api/esquemas";
import { maiorQueda, variacao } from "../lib/metricas";
import { criarAleatorio, normal } from "./aleatorio";
import { PROPOSTAS } from "./propostas";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const TAXA = "0.001";

interface Modelo {
  readonly id: string;
  readonly haMs: number;
  readonly roboId: string;
  readonly simbolo: string;
  readonly acao: "COMPRAR" | "VENDER";
  readonly estado: DecisaoDTO["estado"];
  readonly preco: string;
  readonly quantidade?: string;
  readonly proposta?: keyof typeof PROPOSTAS;
  readonly explicacao: string;
  readonly barreiras?: DecisaoDTO["risco"]["barreiras"];
  readonly desfecho?: string;
  readonly custoIa?: string;
  readonly rejeitada?: string;
}

const MODELOS: readonly Modelo[] = [
  {
    id: "d-01",
    haMs: 26 * MIN,
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    acao: "COMPRAR",
    estado: "aguardando_aprovacao",
    preco: "64180.40",
    quantidade: "0.00310",
    proposta: "btcCompra",
    explicacao: "(RSI(14) (28,4) < 30: sim) e (preço (64.180,4) > SMA(200) (61.902,15): sim)",
    custoIa: "0.0162",
  },
  {
    id: "d-02",
    haMs: 70 * MIN,
    roboId: "r-sol",
    simbolo: "SOLUSDT",
    acao: "COMPRAR",
    estado: "barrada",
    preco: "151.32",
    quantidade: "1.10",
    proposta: "solCompraFraca",
    explicacao: "(preço (151,32) > 1,02 × SMA(50) (148,05): sim) ou (preço cruzou acima de SMA(20): não)",
    barreiras: [
      { codigo: "confianca_baixa", mensagem: "A confiança da IA (58%) está abaixo do mínimo do robô (70%)." },
    ],
    custoIa: "0.0141",
  },
  {
    id: "d-03",
    haMs: 3 * HORA,
    roboId: "r-eth",
    simbolo: "ETHUSDT",
    acao: "COMPRAR",
    estado: "registrada",
    preco: "2471.85",
    quantidade: "0.080",
    proposta: "ethObservar",
    explicacao: "(EMA(9) (2.468,9) cruzou acima de EMA(21) (2.466,2): sim) e não (RSI(14) (54,1) > 70: não)",
    custoIa: "0.0127",
  },
  {
    id: "d-04",
    haMs: 5 * HORA,
    roboId: "r-sol",
    simbolo: "SOLUSDT",
    acao: "COMPRAR",
    estado: "executada",
    preco: "146.90",
    quantidade: "1.20",
    proposta: "solCompra",
    explicacao: "(preço cruzou acima de SMA(20): sim) e (RSI(14) (58,2) ≥ 55: sim)",
    custoIa: "0.0155",
  },
  {
    id: "d-05",
    haMs: 9 * HORA,
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    acao: "VENDER",
    estado: "executada",
    preco: "64702.10",
    quantidade: "0.00250",
    proposta: "btcVendaAlvo",
    explicacao: "preço 64.702,1 chegou ao alvo 64.689,52",
    custoIa: "0.0049",
  },
  {
    id: "d-06",
    haMs: 14 * HORA,
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    acao: "COMPRAR",
    estado: "recusada",
    preco: "63450.00",
    quantidade: "0.00300",
    proposta: "btcCompra",
    explicacao: "(RSI(14) (29,6) < 30: sim) e (preço (63.450) > SMA(200) (61.880,4): sim)",
    custoIa: "0.0158",
  },
  {
    id: "d-07",
    haMs: 20 * HORA,
    roboId: "r-eth",
    simbolo: "ETHUSDT",
    acao: "VENDER",
    estado: "registrada",
    preco: "2512.30",
    quantidade: "0.080",
    explicacao: "preço 2.512,3 chegou ao alvo 2.509,77",
  },
  {
    id: "d-08",
    haMs: 26 * HORA,
    roboId: "r-sol",
    simbolo: "SOLUSDT",
    acao: "VENDER",
    estado: "executada",
    preco: "141.20",
    quantidade: "1.00",
    proposta: "solVendaStop",
    explicacao: "preço 141,2 chegou ao stop 141,22",
    custoIa: "0.0047",
  },
  {
    id: "d-09",
    haMs: 29 * HORA,
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    acao: "COMPRAR",
    estado: "expirada",
    preco: "62980.00",
    quantidade: "0.00300",
    proposta: "btcCompra",
    explicacao: "(RSI(14) (27,9) < 30: sim) e (preço (62.980) > SMA(200) (61.850,7): sim)",
    custoIa: "0.0160",
  },
  {
    id: "d-10",
    haMs: 33 * HORA,
    roboId: "r-sol",
    simbolo: "SOLUSDT",
    acao: "COMPRAR",
    estado: "barrada",
    preco: "143.75",
    quantidade: "3.50",
    proposta: "solCompra",
    explicacao: "(preço (143,75) > 1,02 × SMA(50) (140,1): sim) ou (…: não)",
    barreiras: [
      { codigo: "exposicao", mensagem: "A exposição iria a US$ 538,40; o limite do robô é US$ 500,00." },
    ],
    custoIa: "0.0150",
  },
  {
    id: "d-11",
    haMs: 44 * HORA,
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    acao: "COMPRAR",
    estado: "executada",
    preco: "62740.00",
    quantidade: "0.00250",
    proposta: "btcCompra",
    explicacao: "(RSI(14) (26,8) < 30: sim) e (preço (62.740) > SMA(200) (61.790,2): sim)",
    desfecho: "4.37",
    custoIa: "0.0163",
  },
  {
    id: "d-12",
    haMs: 52 * HORA,
    roboId: "r-sol",
    simbolo: "SOLUSDT",
    acao: "COMPRAR",
    estado: "executada",
    preco: "144.10",
    quantidade: "1.00",
    proposta: "solCompra",
    explicacao: "(preço cruzou acima de SMA(20): sim) e (RSI(14) (56,0) ≥ 55: sim)",
    desfecho: "-3.19",
    custoIa: "0.0152",
  },
  {
    id: "d-13",
    haMs: 58 * HORA,
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    acao: "COMPRAR",
    estado: "falhou",
    preco: "62410.00",
    quantidade: "0.00300",
    proposta: "btcCompra",
    explicacao: "(RSI(14) (28,1) < 30: sim) e (preço (62.410) > SMA(200) (61.700): sim)",
    custoIa: "0.0161",
    rejeitada: "A corretora recusou: saldo insuficiente na testnet.",
  },
  {
    id: "d-14",
    haMs: 68 * HORA,
    roboId: "r-eth",
    simbolo: "ETHUSDT",
    acao: "COMPRAR",
    estado: "registrada",
    preco: "2440.10",
    quantidade: "0.080",
    proposta: "ethObservar",
    explicacao: "(EMA(9) cruzou acima de EMA(21): sim) e não (RSI(14) (49,3) > 70: não)",
    custoIa: "0.0122",
  },
];

function proposta(m: Modelo): PropostaAgente | undefined {
  if (!m.proposta) return undefined;
  const base = PROPOSTAS[m.proposta];
  if (!base) return undefined;
  if (m.acao !== "COMPRAR") return base;
  const entrada = dec(m.preco);
  return {
    ...base,
    stop: precoStop(entrada, 0.025).toFixed(2),
    alvo: precoAlvo(entrada, 0.03, 0.001).toFixed(2),
  };
}

function paraDecisao(m: Modelo, agora: number): DecisaoDTO {
  const p = proposta(m);
  const executada = m.estado === "executada" || m.estado === "falhou";
  return {
    id: m.id,
    roboId: m.roboId,
    em: agora - m.haMs,
    sinal: { acao: m.acao, explicacao: m.explicacao },
    ...(p ? { proposta: p } : {}),
    ...(m.quantidade ? { quantidade: m.quantidade } : {}),
    preco: m.preco,
    risco: { aprovada: !m.barreiras, barreiras: m.barreiras ?? [] },
    estado: m.estado,
    ...(executada ? { ordemId: `o-${m.id}` } : {}),
    ...(m.custoIa ? { custoIaUsd: m.custoIa } : {}),
    ...(m.desfecho ? { desfecho: { resultado: m.desfecho, avaliadoEm: agora - m.haMs + 20 * HORA } } : {}),
  };
}

function paraOrdem(m: Modelo, agora: number): OrdemDTO {
  const em = agora - m.haMs + 4000;
  const quantidade = m.quantidade ?? "0";
  const base = {
    id: `o-${m.id}`,
    decisaoId: m.id,
    idCliente: `zt-${m.id}`,
    simbolo: m.simbolo,
    lado: m.acao === "COMPRAR" ? ("COMPRA" as const) : ("VENDA" as const),
    quantidade,
    criadaEm: em,
  };
  if (m.rejeitada) return { ...base, estado: "REJEITADA", motivo: m.rejeitada, execucoes: [] };
  const taxa = dec(m.preco).times(quantidade).times(TAXA).toFixed(8);
  return {
    ...base,
    estado: "PREENCHIDA",
    execucoes: [{ preco: m.preco, quantidade, taxaCotacao: taxa, em }],
  };
}

export const decisoesIniciais = (agora: number): DecisaoDTO[] => MODELOS.map((m) => paraDecisao(m, agora));

export const ordensIniciais = (agora: number): OrdemDTO[] =>
  MODELOS.filter((m) => m.estado === "executada" || m.estado === "falhou").map((m) => paraOrdem(m, agora));

/** Curva de patrimônio real (30 dias, a cada 6 h), somada em Decimal. */
export function patrimonioInicial(agora: number, inicial = "1000"): PontoPatrimonio[] {
  const aleatorio = criarAleatorio(42);
  const passo = 6 * HORA;
  const pontos: PontoPatrimonio[] = [];
  let valor = dec(inicial);
  for (let i = 119; i >= 0; i--) {
    pontos.push({ em: agora - i * passo, valor: valor.toFixed(2) });
    valor = valor.plus((normal(aleatorio) * 3.2 + 0.18).toFixed(2));
  }
  return pontos;
}

function curvaBacktest(semente: number, inicio: number, fim: number, deriva: number): PontoPatrimonio[] {
  const aleatorio = criarAleatorio(semente);
  const n = 90;
  const passo = (fim - inicio) / (n - 1);
  let valor = dec(1000);
  return Array.from({ length: n }, (_, i) => {
    const ponto = { em: Math.round(inicio + i * passo), valor: valor.toFixed(2) };
    valor = valor.plus((normal(aleatorio) * 6 + deriva).toFixed(2));
    return ponto;
  });
}

function concluido(
  id: string,
  extra: Omit<Backtest, "id" | "estado">,
  curva: PontoPatrimonio[],
  taxas: string,
  operacoes: number,
  acertos: number,
): Backtest {
  const valores = curva.map((p) => p.valor);
  const v = variacao(valores);
  return {
    id,
    estado: "concluido",
    ...extra,
    capitalInicial: "1000",
    curva,
    metricas: {
      resultado: v.absoluta,
      resultadoPercentual: v.fracao,
      maiorQueda: maiorQueda(valores),
      taxas,
      operacoes,
      acertos,
    },
  };
}

export function backtestsIniciais(agora: number): Backtest[] {
  const fim = agora - DIA;
  const inicio = fim - 90 * DIA;
  return [
    concluido(
      "b-1",
      { estrategiaId: "e-rsi", versao: 3, simbolo: "BTCUSDT", intervalo: "1h", inicio, fim },
      curvaBacktest(7, inicio, fim, 0.9),
      "18.42",
      37,
      21,
    ),
    concluido(
      "b-2",
      { estrategiaId: "e-rompimento", versao: 2, simbolo: "SOLUSDT", intervalo: "4h", inicio, fim },
      curvaBacktest(11, inicio, fim, -0.7),
      "26.10",
      52,
      22,
    ),
  ];
}
