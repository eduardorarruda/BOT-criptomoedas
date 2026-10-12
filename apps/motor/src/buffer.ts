import { contextoDeCandles, type Candle, type ContextoMercado } from "@zentrade/dominio";

/**
 * Os últimos N candles fechados, num buffer circular: memória fixa por robô, sem
 * array crescendo para sempre. Recusa candle repetido ou fora de ordem — o mesmo
 * candle entregue duas vezes (reconexão, reenvio do stream) não decide duas vezes.
 */
export class BufferCandles {
  private readonly itens: (Candle | undefined)[];
  private inicio = 0;
  private quantidade = 0;

  constructor(readonly capacidade: number) {
    if (!Number.isInteger(capacidade) || capacidade < 1)
      throw new RangeError("A capacidade do buffer de candles precisa ser um inteiro positivo.");
    this.itens = new Array<Candle | undefined>(capacidade);
  }

  get tamanho(): number {
    return this.quantidade;
  }

  ultimo(): Candle | undefined {
    if (this.quantidade === 0) return undefined;
    return this.itens[(this.inicio + this.quantidade - 1) % this.capacidade];
  }

  /** `false` quando o candle não é mais novo que o último guardado. */
  adicionar(candle: Candle): boolean {
    const ultimo = this.ultimo();
    if (ultimo && candle.abertura <= ultimo.abertura) return false;
    if (this.quantidade < this.capacidade) {
      this.itens[(this.inicio + this.quantidade) % this.capacidade] = candle;
      this.quantidade++;
    } else {
      this.itens[this.inicio] = candle;
      this.inicio = (this.inicio + 1) % this.capacidade;
    }
    return true;
  }

  /** Cópia em ordem, do mais antigo ao mais recente. */
  lista(): Candle[] {
    return Array.from(
      { length: this.quantidade },
      (_, i) => this.itens[(this.inicio + i) % this.capacidade] as Candle,
    );
  }

  /** Indicadores são number; o preço de decisão continua decimal exato. */
  fechamentos(): number[] {
    return this.lista().map((c) => c.fecha.toNumber());
  }

  /** Contexto completo (abertura, máxima, mínima, fechamento e volume) para as regras. */
  contexto(): ContextoMercado {
    return contextoDeCandles(this.lista());
  }
}
