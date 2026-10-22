import type { Estrategia } from "./estrategia.js";
import type { Operando, Regra } from "./regras.js";

/** Quantos candles um operando precisa para ter valor (o maior período que ele usa). */
function periodoDe(op: Operando): number {
  if (op.tipo === "multiplicar") return periodoDe(op.operando);
  if (op.tipo !== "indicador") return 0;
  if (op.nome === "macd") return op.lenta + op.periodoSinal;
  // A faixa de abertura conta minutos do pregão, não candles; o VWAP não tem período.
  if (op.nome === "faixaAbertura" || op.nome === "vwap") return 0;
  return op.periodo;
}

function periodoDaRegra(r: Regra): number {
  switch (r.tipo) {
    case "comparar":
      return Math.max(periodoDe(r.esquerda), periodoDe(r.direita));
    case "nao":
      return periodoDaRegra(r.regra);
    case "e":
    case "ou":
      return Math.max(0, ...r.regras.map(periodoDaRegra));
    case "horario":
      return 0;
  }
}

/**
 * Candles de histórico antes do início que o backtest deve carregar para a estratégia
 * ter todos os indicadores prontos já no primeiro candle da janela: o maior período das
 * regras e dos ATR (stop, stop móvel, tamanho), nunca abaixo de `minimo`. Com a SMA 400 do
 * cofre de tendência, o aquecimento fixo de 200 deixaria a regra sem dados.
 */
export function candlesDeAquecimento(e: Estrategia, minimo: number): number {
  const regras = [e.entrada, e.saida, e.entradaVendida, e.saidaVendida].filter(
    (r): r is Regra => r !== undefined,
  );
  const atr = [
    e.stopAtr?.periodo,
    e.stopMovel?.tipo === "atr" ? e.stopMovel.periodo : undefined,
    e.tamanhoPorVolatilidade?.periodo,
  ];
  return Math.max(minimo, ...regras.map(periodoDaRegra), ...atr.map((p) => p ?? 0));
}
