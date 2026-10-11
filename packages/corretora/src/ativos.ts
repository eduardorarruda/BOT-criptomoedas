import { ErroConfiguracao } from "./erros.js";
import type { AtivosDoPar } from "./conversao.js";

// Mais longas primeiro: "FDUSD" antes de "USD...", senão ETHFDUSD viraria ETHF + DUSD.
const COTACOES = ["FDUSD", "USDT", "USDC", "TUSD", "BUSD", "BRL", "EUR", "TRY", "BTC", "ETH", "BNB"];

/**
 * Base e cotação a partir do nome do par, para quem não tem o exchangeInfo à mão
 * (corretora de papel, motor). A Binance devolve isso no exchangeInfo, que tem
 * prioridade quando disponível.
 */
export function ativosDoSimbolo(simbolo: string): AtivosDoPar {
  const cotacao = COTACOES.find((c) => simbolo.endsWith(c) && simbolo.length > c.length);
  if (!cotacao)
    throw new ErroConfiguracao(
      `Não sei separar base e cotação de "${simbolo}". Use um par com cotação conhecida (${COTACOES.join(", ")}).`,
    );
  return { base: simbolo.slice(0, -cotacao.length), cotacao };
}
