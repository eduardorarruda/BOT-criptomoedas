import type { Relogio } from "@zentrade/contratos";

export class RelogioSistema implements Relogio {
  agora(): number {
    return Date.now();
  }
}

/** Relógio que só anda quando mandam: testes e backtest (o tempo é o do candle). */
export class RelogioManual implements Relogio {
  constructor(private instante = 0) {}

  agora(): number {
    return this.instante;
  }

  definir(instante: number): void {
    this.instante = instante;
  }

  avancar(ms: number): void {
    this.instante += ms;
  }

  /** "Dorme" avançando o próprio relógio, sem esperar de verdade. */
  dormir = (ms: number): Promise<void> => {
    this.avancar(ms);
    return Promise.resolve();
  };
}

export const dormirReal = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
