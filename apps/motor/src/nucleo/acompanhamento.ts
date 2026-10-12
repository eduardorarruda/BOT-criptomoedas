import type { RoboConfig } from "@zentrade/contratos";
import {
  atualizarStop,
  contextoAte,
  dec,
  formatarNumero,
  iniciarAcompanhamento,
  reconstruirAcompanhamento,
  type Acompanhamento,
  type Candle,
  type ContextoMercado,
  type Estrategia,
  type Execucao,
  type Posicao,
} from "@zentrade/dominio";
import type { ProtecaoEfetiva } from "./posicao-aberta.js";
import type { Dependencias } from "./tipos.js";

/** Quando a posição aberta começou: a primeira compra depois da última vez que ela zerou. */
export function inicioDaPosicao(execucoes: readonly Execucao[]): number | null {
  let quantidade = dec(0);
  let inicio: number | null = null;
  for (const e of execucoes) {
    if (quantidade.isZero() && e.lado === "COMPRA") inicio = e.em;
    quantidade = e.lado === "COMPRA" ? quantidade.plus(e.quantidade) : quantidade.minus(e.quantidade);
    if (quantidade.lte(0)) {
      quantidade = dec(0);
      inicio = null;
    }
  }
  return inicio;
}

/** Candles do intervalo que fecharam depois da entrada (a contagem da saída por tempo). */
export const candlesDesde = (candles: readonly Candle[], desde: number): number =>
  candles.filter((c) => c.fechamento > desde).length;

/**
 * O que muda com a posição aberta entre um candle e outro — stop efetivo (stop móvel,
 * empate), maior máxima e candles desde a entrada — guardado em memória e refeito
 * dos candles do buffer depois de um reinício (as mesmas contas do caminho ao vivo).
 * Cada stop novo vai para o diário (subirStop) e, pelo stop efetivo, para a corretora.
 */
export class AcompanhamentoPosicao {
  private atual: Acompanhamento | null = null;

  constructor(
    private readonly robo: RoboConfig,
    private readonly deps: Dependencias,
    private readonly candles: () => readonly Candle[],
    private readonly contexto: () => ContextoMercado,
  ) {}

  /** A compra executou: começa do stop efetivo dela. */
  aoComprar(estrategia: Estrategia, posicao: Posicao): void {
    this.atual = iniciarAcompanhamento(estrategia, posicao);
  }

  /** A posição mudou por fora do caminho normal (ordem incerta resolvida, venda): refaz quando precisar. */
  esquecer(): void {
    this.atual = null;
  }

  /**
   * Candle do intervalo fechou (já no buffer) com a posição aberta: sobe o stop se o
   * stop móvel ou o empate pedirem e conta o candle. O stop novo vai para o diário.
   */
  async noIntervalo(
    estrategia: Estrategia,
    posicao: Posicao,
    decisaoId: string | null,
  ): Promise<Acompanhamento | null> {
    if (posicao.quantidade.isZero()) {
      this.atual = null;
      return null;
    }
    const contexto = this.contexto();
    const anterior = this.atual ?? (await this.reconstruir(estrategia, posicao, contexto, 1));
    const r = atualizarStop(estrategia, anterior, contexto);
    this.atual = r.acompanhamento;
    if (r.novoStop) {
      if (decisaoId) await this.deps.decisoes.subirStop(decisaoId, r.novoStop);
      this.deps.registro.info(
        { roboId: this.robo.id, stop: formatarNumero(r.novoStop) },
        r.explicacao ?? "o stop efetivo subiu",
      );
    }
    return this.atual;
  }

  /** Entre um candle do intervalo e outro (vigia de 1 min): o de agora, refeito do buffer se preciso. */
  async vigente(estrategia: Estrategia, posicao: Posicao): Promise<Acompanhamento | null> {
    if (posicao.quantidade.isZero()) {
      this.atual = null;
      return null;
    }
    this.atual ??= await this.reconstruir(estrategia, posicao, this.contexto(), 0);
    return this.atual;
  }

  /** O stop efetivo de agora sobre a proteção da compra (o maior dos dois: o stop só sobe). */
  aplicar(base: ProtecaoEfetiva | null): ProtecaoEfetiva | null {
    const a = this.atual;
    return base && a && a.stop.gt(base.stop) ? { ...base, stop: a.stop } : base;
  }

  /**
   * Depois de um reinício: repassa os candles fechados desde a entrada, menos os
   * `ignorarUltimos` (o candle que ainda vai ser processado agora).
   */
  private async reconstruir(
    estrategia: Estrategia,
    posicao: Posicao,
    contexto: ContextoMercado,
    ignorarUltimos: number,
  ): Promise<Acompanhamento> {
    const inicial = iniciarAcompanhamento(estrategia, posicao);
    const inicio = inicioDaPosicao(await this.deps.ordens.execucoes(this.robo.id));
    const candles = this.candles();
    const ate = candles.length - ignorarUltimos;
    if (inicio === null || ate <= 0) return inicial;
    const vistos = candlesDesde(candles.slice(0, ate), inicio);
    return reconstruirAcompanhamento(estrategia, inicial, contextoAte(contexto, ate - 1), vistos);
  }
}
