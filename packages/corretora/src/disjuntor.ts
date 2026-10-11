/**
 * A Binance limita e bane por IP (429 e 418), não por chave. Um bloqueio visto por um
 * cliente precisa valer para todos os outros do processo — robôs de outras pessoas e a
 * sincronização da carteira —, senão cada cliente novo volta a chamar durante o
 * banimento e a Binance aumenta a pena.
 */
export class Disjuntor {
  private bloqueadoAte = 0;

  /** Um bloqueio novo nunca encurta um mais longo que já estava valendo. */
  bloquear(ate: number): void {
    this.bloqueadoAte = Math.max(this.bloqueadoAte, ate);
  }

  restanteMs(agora: number): number {
    return Math.max(0, this.bloqueadoAte - agora);
  }
}

const porRede = new Map<"testnet" | "real", Disjuntor>();

/** O disjuntor do processo para uma rede da Binance (testnet e real têm limites separados). */
export function disjuntorDaRede(rede: "testnet" | "real"): Disjuntor {
  const existente = porRede.get(rede);
  if (existente) return existente;
  const novo = new Disjuntor();
  porRede.set(rede, novo);
  return novo;
}
