import { paraTexto, type Posicao, type Sinal } from "@zentrade/dominio";
import type { ResultadoCiclo } from "./tipos.js";

interface Bloqueio {
  readonly chave: string;
  readonly quantidade: string;
  readonly pausado: boolean;
}

const chaveDo = (sinal: Sinal): string => (sinal.acao === "VENDER" ? `VENDER:${sinal.motivo}` : sinal.acao);

/**
 * Decidiu e não saiu ordem nem pedido de aprovação: barrada, agente aguardando ou só
 * registrada. "falhou" sem ordem (a proteção não saiu do livro) não conta: tenta de novo.
 */
const bloqueada = (r: ResultadoCiclo | null): boolean =>
  r !== null && r.estado !== null && !r.ordem && r.estado !== "aguardando_aprovacao" && r.estado !== "falhou";

/**
 * Lembra a última decisão bloqueada para os candles de 1 min não a repetirem a cada
 * minuto (posição de poeira com o preço no stop, que nenhuma ordem vende): uma
 * decisão no diário, uma chamada ao agente. Volta a decidir com
 * um candle novo do intervalo, com a posição mudando ou com a parada total mudando.
 */
export class MemoriaBloqueio {
  private ultimo: Bloqueio | null = null;

  constructor(private readonly pausado: () => Promise<boolean>) {}

  /** Candle novo do intervalo: tudo pode ser decidido de novo. */
  novoIntervalo(): void {
    this.ultimo = null;
  }

  async repetido(sinal: Sinal, posicao: Posicao): Promise<boolean> {
    const u = this.ultimo;
    if (!u || u.chave !== chaveDo(sinal) || u.quantidade !== paraTexto(posicao.quantidade)) return false;
    return (await this.pausado()) === u.pausado;
  }

  async registrar(sinal: Sinal, r: ResultadoCiclo | null, posicao: Posicao): Promise<void> {
    if (!bloqueada(r)) {
      this.ultimo = null;
      return;
    }
    this.ultimo = {
      chave: chaveDo(sinal),
      quantidade: paraTexto(posicao.quantidade),
      pausado: await this.pausado(),
    };
  }
}
