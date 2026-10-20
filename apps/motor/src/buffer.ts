import { duracaoDoCandle, type Candle, type ContextoMercado } from "@zentrade/dominio";

/** O candle já em número, convertido uma vez só ao entrar (as regras pedem o contexto a cada decisão). */
interface VelaNumerica {
  readonly abre: number;
  readonly maxima: number;
  readonly minima: number;
  readonly fecha: number;
  readonly volume: number;
}

const emNumero = (c: Candle): VelaNumerica => ({
  abre: c.abre.toNumber(),
  maxima: c.maxima.toNumber(),
  minima: c.minima.toNumber(),
  fecha: c.fecha.toNumber(),
  volume: c.volume.toNumber(),
});

/**
 * Os últimos N candles fechados, num buffer circular: memória fixa por robô, sem
 * array crescendo para sempre. Recusa candle repetido ou fora de ordem — o mesmo
 * candle entregue duas vezes (reconexão, reenvio do stream) não decide duas vezes.
 */
export class BufferCandles {
  private readonly itens: (Candle | undefined)[];
  private readonly numeros: (VelaNumerica | undefined)[];
  private inicio = 0;
  private quantidade = 0;

  constructor(
    readonly capacidade: number,
    /** O fuso da instância: onde as regras de horário leem a hora do candle (padrão: Brasília). */
    private readonly fuso?: string,
  ) {
    if (!Number.isInteger(capacidade) || capacidade < 1)
      throw new RangeError("A capacidade do buffer de candles precisa ser um inteiro positivo.");
    this.itens = new Array<Candle | undefined>(capacidade);
    this.numeros = new Array<VelaNumerica | undefined>(capacidade);
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
    const posicao =
      this.quantidade < this.capacidade ? (this.inicio + this.quantidade) % this.capacidade : this.inicio;
    this.itens[posicao] = candle;
    this.numeros[posicao] = emNumero(candle);
    if (this.quantidade < this.capacidade) this.quantidade++;
    else this.inicio = (this.inicio + 1) % this.capacidade;
    return true;
  }

  /** Cópia em ordem, do mais antigo ao mais recente. */
  lista(): Candle[] {
    return Array.from(
      { length: this.quantidade },
      (_, i) => this.itens[(this.inicio + i) % this.capacidade] as Candle,
    );
  }

  private emOrdem(): VelaNumerica[] {
    return Array.from(
      { length: this.quantidade },
      (_, i) => this.numeros[(this.inicio + i) % this.capacidade] as VelaNumerica,
    );
  }

  /** Indicadores são number; o preço de decisão continua decimal exato. */
  fechamentos(): number[] {
    return this.emOrdem().map((v) => v.fecha);
  }

  /** Contexto completo (abertura, máxima, mínima, fechamento, volume e instantes) para as regras. */
  contexto(): ContextoMercado {
    const v = this.emOrdem();
    const velas = this.lista();
    const primeiro = velas[0];
    return {
      fechamentos: v.map((x) => x.fecha),
      aberturas: v.map((x) => x.abre),
      maximas: v.map((x) => x.maxima),
      minimas: v.map((x) => x.minima),
      volumes: v.map((x) => x.volume),
      instantes: velas.map((c) => c.abertura),
      ...(primeiro ? { intervaloMs: duracaoDoCandle(primeiro) } : {}),
      ...(this.fuso ? { fuso: this.fuso } : {}),
    };
  }
}
