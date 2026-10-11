import { dec } from "@zentrade/dominio";

/** Contas sobre séries de valores em texto decimal, sempre em Decimal. */
export function maiorQueda(valores: readonly string[]): string {
  let topo = null as ReturnType<typeof dec> | null;
  let pior = dec(0);
  for (const texto of valores) {
    const v = dec(texto);
    if (topo === null || v.gt(topo)) topo = v;
    const queda = v.minus(topo);
    if (queda.lt(pior)) pior = queda;
  }
  return pior.toFixed();
}

export function somar(valores: readonly string[]): string {
  return valores.reduce((total, v) => total.plus(dec(v)), dec(0)).toFixed();
}

export function variacao(valores: readonly string[]): { absoluta: string; fracao: string } {
  const primeiro = valores[0];
  const ultimo = valores[valores.length - 1];
  if (primeiro === undefined || ultimo === undefined) return { absoluta: "0", fracao: "0" };
  const a = dec(primeiro);
  const diferenca = dec(ultimo).minus(a);
  return { absoluta: diferenca.toFixed(), fracao: a.isZero() ? "0" : diferenca.div(a).toFixed() };
}

interface PontoCurva {
  readonly em: number;
  readonly patrimonio: string;
}

/** A curva do backtest no formato do gráfico de linha (`valor` em vez de `patrimonio`). */
export const curvaParaGrafico = (curva: readonly PontoCurva[]): { em: number; valor: string }[] =>
  curva.map((p) => ({ em: p.em, valor: p.patrimonio }));

/**
 * Capital inicial do backtest: patrimônio final menos o resultado, quando o motor
 * informa o final; senão, o primeiro ponto da curva. `null` se não der para saber.
 */
export function capitalInicial(
  m: { readonly resultadoLiquido: string; readonly patrimonioFinal?: string | undefined },
  curva: readonly PontoCurva[] | null,
): string | null {
  if (m.patrimonioFinal !== undefined) return dec(m.patrimonioFinal).minus(dec(m.resultadoLiquido)).toFixed();
  return curva?.[0]?.patrimonio ?? null;
}

/** Fração do resultado sobre o capital (0,1 = 10%); "0" quando o capital é zero. */
export function fracaoSobre(resultado: string, capital: string): string {
  const c = dec(capital);
  return c.isZero() ? "0" : dec(resultado).div(c).toFixed();
}

/** Métricas no formato do contrato a partir de uma curva simulada (modo de demonstração). */
export function metricasDaCurva(
  curva: readonly PontoCurva[],
  taxasPagas: string,
  operacoes: number,
  acertos: number,
) {
  const valores = curva.map((p) => p.patrimonio);
  const v = variacao(valores);
  const queda = dec(maiorQueda(valores)).abs();
  const pico = valores.reduce((a, b) => (dec(b).gt(dec(a)) ? b : a), valores[0] ?? "0");
  return {
    resultadoLiquido: v.absoluta,
    patrimonioFinal: valores.at(-1) ?? "0",
    maiorQueda: queda.toFixed(),
    maiorQuedaPercentual: dec(pico).isZero() ? 0 : Math.min(1, queda.div(dec(pico)).toNumber()),
    operacoes,
    acertos,
    taxaAcerto: operacoes === 0 ? 0 : acertos / operacoes,
    taxasPagas,
  };
}
