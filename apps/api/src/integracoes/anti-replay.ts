/**
 * Anti-replay dos webhooks: a assinatura já vale só por 5 minutos, mas dentro desse
 * prazo quem copiasse a requisição poderia reenviá-la. Guardamos cada assinatura
 * usada pelo tempo que ela ainda vale e recusamos a segunda vez.
 */
export interface AntiReplay {
  /** `true` na primeira vez que a chave aparece; `false` se já foi usada (dentro do TTL). */
  primeiraVez(chave: string, ttlSegundos: number): Promise<boolean>;
}

export const PREFIXO_ASSINATURA_USADA = "zentrade:webhook:assinatura:";

/** SET NX EX: atômico, então duas cópias simultâneas não passam juntas. */
export function antiReplayRedis(redis: {
  set(chave: string, valor: string, ex: "EX", segundos: number, nx: "NX"): Promise<"OK" | null>;
}): AntiReplay {
  return {
    primeiraVez: async (chave, ttl) =>
      (await redis.set(`${PREFIXO_ASSINATURA_USADA}${chave}`, "1", "EX", ttl, "NX")) === "OK",
  };
}

/** Para testes: lembra em memória, respeitando o TTL pelo relógio recebido. */
export function antiReplayMemoria(agora: () => number = Date.now): AntiReplay {
  const usadas = new Map<string, number>();
  return {
    async primeiraVez(chave, ttl) {
      const ate = usadas.get(chave);
      if (ate !== undefined && ate > agora()) return false;
      usadas.set(chave, agora() + ttl * 1000);
      return true;
    },
  };
}
