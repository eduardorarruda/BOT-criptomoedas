import type { CandidataAvaliacao, NovaAvaliacao } from "@zentrade/contratos";
import { ativosDoSimbolo } from "@zentrade/corretora";
import {
  contextoDeCandles,
  CUSTOS_WIN_PADRAO,
  dec,
  mercadoDoSimbolo,
  SESSAO_B3_PADRAO,
  simularDesfecho,
  tamanhoDeReferenciaCripto,
  type Candle,
  type CustosDesfecho,
  type Valor,
  type VeredictoClaude,
} from "@zentrade/dominio";

/**
 * A avaliação de uma decisão do Claude, sem rede nem banco: dado o que a porta do
 * placar devolve e os candles em volta, diz o desfecho. Executada e fechada: o
 * resultado real. Executada e ainda aberta: pendente (espera o real). O resto (vetos,
 * aprovações que o modo observar, o risco ou a pessoa não deixaram executar): o
 * contrafactual do domínio, com o tamanho da decisão ou, sem ele, o de referência
 * pelo risco do robô.
 */
export interface OpcoesPlacar {
  /** Quantos candles esperar por stop, alvo, regra ou tempo antes de fechar no horizonte. */
  readonly horizonte: number;
  /** Deslizamento mais meio spread contra quem opera no cripto (pontos-base). */
  readonly bpsContra: number;
  /** Candles antes da decisão para os indicadores (regra de saída, ATR). */
  readonly aquecimento: number;
}

/** 7 pontos-base: os mesmos 5 de deslizamento e 2 de meio spread do backtest. */
export const OPCOES_PLACAR_PADRAO: OpcoesPlacar = { horizonte: 500, bpsContra: 7, aquecimento: 300 };

export interface VelasDaDecisao {
  /** Até o candle do sinal, inclusive. */
  readonly antes: readonly Candle[];
  /** Os que fecharam depois do sinal, até o horizonte. */
  readonly depois: readonly Candle[];
}

const veredicto = (c: CandidataAvaliacao): VeredictoClaude =>
  c.proposta.acao === "comprar" ? "aprovou" : "vetou";

/** BRL no mini índice; no cripto, a cotação do par (USDT em BTCUSDT). */
export function moedaDe(simbolo: string): string {
  if (mercadoDoSimbolo(simbolo) === "win") return "BRL";
  return ativosDoSimbolo(simbolo).cotacao;
}

function custosDe(c: CandidataAvaliacao, o: OpcoesPlacar): CustosDesfecho {
  if (mercadoDoSimbolo(c.simbolo) === "win")
    return { mercado: "win", custos: CUSTOS_WIN_PADRAO, sessao: SESSAO_B3_PADRAO };
  return { mercado: "cripto", taxaPorLado: c.estrategia.taxa, bpsContra: o.bpsContra };
}

/** O tamanho da conta: o da decisão, se houver; senão, o de referência (1 contrato no WIN). */
function quantidadeDe(c: CandidataAvaliacao, antes: readonly Candle[]): Valor {
  if (c.quantidade?.gt(0)) return c.quantidade;
  if (mercadoDoSimbolo(c.simbolo) === "win") return dec(1);
  const referencia = tamanhoDeReferenciaCripto({
    estrategia: c.estrategia,
    preco: c.preco,
    contexto: contextoDeCandles(antes),
    riscoPorOperacao: c.riscoPorOperacao,
    exposicaoMaxima: c.exposicaoMaxima,
  });
  // Robô sem risco nem exposição: 1 unidade ainda mede o retorno (o dinheiro fica simbólico).
  return referencia ?? dec(1);
}

function real(
  c: CandidataAvaliacao,
  base: Omit<NovaAvaliacao, "fonte" | "situacao" | "barras">,
  barras: number,
) {
  if (!c.resultadoReal) return { ...base, fonte: "real" as const, situacao: "pendente" as const, barras };
  const nocional = c.quantidade?.gt(0) ? c.quantidade.times(c.preco) : null;
  return {
    ...base,
    fonte: "real" as const,
    situacao: "concluida" as const,
    barras,
    ...(c.quantidade ? { quantidade: c.quantidade } : {}),
    resultado: c.resultadoReal,
    retorno: nocional ? c.resultadoReal.div(nocional).toNumber() : 0,
  };
}

export function avaliarCandidata(
  c: CandidataAvaliacao,
  velas: VelasDaDecisao,
  agora: number,
  o: OpcoesPlacar = OPCOES_PLACAR_PADRAO,
): NovaAvaliacao {
  const base = {
    decisaoId: c.decisaoId,
    usuarioId: c.usuarioId,
    claude: veredicto(c),
    confianca: c.proposta.confianca,
    moeda: moedaDe(c.simbolo),
    em: agora,
  };
  if (c.estado === "executada") return real(c, base, velas.depois.length);
  const quantidade = quantidadeDe(c, velas.antes);
  const d = simularDesfecho({
    estrategia: c.estrategia,
    sentido: "comprado",
    preco: c.preco,
    quantidade,
    custos: custosDe(c, o),
    antes: velas.antes,
    depois: velas.depois,
    horizonte: o.horizonte,
    ...(c.protecao ? { protecao: c.protecao } : {}),
  });
  if (d.situacao === "pendente")
    return { ...base, fonte: "contrafactual", situacao: "pendente", barras: d.barras, quantidade };
  return {
    ...base,
    fonte: "contrafactual",
    situacao: "concluida",
    motivo: d.motivo,
    quantidade,
    precoEntrada: d.entrada,
    precoSaida: d.saida,
    resultado: d.resultado,
    retorno: d.retorno,
    barras: d.barras,
  };
}
