import type { OperacaoPedido, PedidoAnalise } from "@zentrade/contratos";
import type { CustoIdaEVolta } from "./custos.js";
import { duracao, num, pct, pctSinal, preco as fmtPreco } from "./formato.js";

/**
 * Alvo a pelo menos 5× a distância do stop é "distante": nos modelos de tendência e
 * rompimento ele fica longe DE PROPÓSITO e quem encerra é a regra de saída, o stop ou
 * o tempo. Ler o alvo como expectativa de ganho distorce o risco/retorno.
 */
export const ALVO_DISTANTE_MULTIPLO = 5;

export interface LeituraSaidas {
  readonly linhas: readonly string[];
  readonly alvoDistante: boolean;
  /** Distância do stop ÷ custo de ida e volta. */
  readonly stopEmCustos: number | null;
  /** Distância do stop ÷ ATR(14) atual. */
  readonly stopEmAtr: number | null;
}

/** Quem encerra a operação além do alvo: "a regra de saída, o stop ou o tempo". */
function quemEncerra(op: OperacaoPedido): string {
  const saidas = [
    ...(op.regraSaida ? ["a regra de saída"] : []),
    "o stop",
    ...(op.tempoMaximo !== undefined ? ["o tempo"] : []),
  ];
  return saidas.length === 1
    ? (saidas[0] as string)
    : `${saidas.slice(0, -1).join(", ")} ou ${saidas.at(-1)}`;
}

function linhasDaEstrategia(op: OperacaoPedido, pedido: PedidoAnalise): string[] {
  const favor = op.sentido === "comprado" ? "+" : "−";
  return [
    op.stopAtr
      ? `Stop por ATR: ${num(op.stopAtr.multiplo)} × ATR(${op.stopAtr.periodo}), no máximo ${pct(op.stopPercentual)} da entrada.`
      : `Stop fixo: ${pct(op.stopPercentual)} da entrada.`,
    ...(op.stopMovel
      ? [
          op.stopMovel.tipo === "atr"
            ? `Stop móvel: ${num(op.stopMovel.multiplo)} × ATR(${op.stopMovel.periodo}) do melhor preço desde a entrada (só anda a favor).`
            : `Stop móvel: a ${pct(op.stopMovel.distancia)} do melhor preço desde a entrada (só anda a favor).`,
        ]
      : []),
    ...(op.empate
      ? [
          `Empate: depois de ${favor}${pct(op.empate.gatilho)}, o stop vai para o preço de empate (as duas taxas pagas).`,
        ]
      : []),
    ...(op.regraSaida ? [`Regra de saída: ${op.regraSaida} (avaliada no fechamento de cada vela).`] : []),
    ...(op.tempoMaximo !== undefined
      ? [`Tempo máximo: ${op.tempoMaximo} velas (${duracao(op.tempoMaximo, pedido.robo.intervalo)}).`]
      : []),
  ];
}

/**
 * Como a posição sai e o tamanho do stop em % do preço, em custos de ida e volta e em
 * ATR — números, para a IA não avaliar "stop dentro do ruído" por impressão.
 */
export function leituraDasSaidas(
  pedido: PedidoAnalise,
  custo: CustoIdaEVolta | null,
  atr: number | null,
): LeituraSaidas {
  const op = pedido.operacao;
  const p = pedido.preco.toNumber();
  const linhas: string[] = [];
  let stopEmCustos: number | null = null;
  let stopEmAtr: number | null = null;
  let alvoDistante = false;

  if (pedido.sinal.acao === "COMPRAR") {
    const stop = pedido.sinal.stop.toNumber();
    const alvo = pedido.sinal.alvo.toNumber();
    const distStop = Math.abs(p - stop);
    stopEmCustos = custo && custo.fracao > 0 ? distStop / p / custo.fracao : null;
    stopEmAtr = atr && atr > 0 ? distStop / atr : null;
    const medidas = [
      pctSinal((stop - p) / p),
      ...(stopEmCustos !== null ? [`${num(stopEmCustos, 1)} custos de ida e volta`] : []),
      ...(stopEmAtr !== null ? [`${num(stopEmAtr, 1)} ATR(14)`] : []),
    ];
    linhas.push(`Stop inicial: ${fmtPreco(stop)} (${medidas.join("; ")}).`);
    const multiplo = distStop > 0 ? Math.abs(alvo - p) / distStop : Infinity;
    alvoDistante = op !== undefined && multiplo >= ALVO_DISTANTE_MULTIPLO;
    linhas.push(
      alvoDistante && op
        ? `Alvo fixo: ${fmtPreco(alvo)} (${pctSinal((alvo - p) / p)}) — DISTANTE DE PROPÓSITO (${num(multiplo, 0)}× a distância do stop): quem encerra é ${quemEncerra(op)}. Não use o alvo como expectativa de ganho nem para medir risco/retorno.`
        : `Alvo fixo: ${fmtPreco(alvo)} (${pctSinal((alvo - p) / p)}; ${num(multiplo, 1)}× a distância do stop).`,
    );
  } else if (pedido.posicao.quantidade.gt(0)) {
    const pm = pedido.posicao.precoMedio.toNumber();
    const bruto = op?.sentido === "vendido" ? (pm - p) / pm : p / pm - 1;
    const liquido = custo ? `, ≈ ${pctSinal(bruto - custo.fracao)} líquido se sair agora` : "";
    linhas.push(`Posição aberta a ${fmtPreco(pm)}: ${pctSinal(bruto)} bruto${liquido}.`);
  }

  if (!op) {
    linhas.push(
      "O motor não informou como a operação sai nem os custos (versão antiga do motor): não suponha taxas; avalie com cautela.",
    );
    return { linhas, alvoDistante, stopEmCustos, stopEmAtr };
  }
  linhas.push(...linhasDaEstrategia(op, pedido));
  return { linhas, alvoDistante, stopEmCustos, stopEmAtr };
}
