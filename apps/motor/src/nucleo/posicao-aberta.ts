import type { RoboConfig } from "@zentrade/contratos";
import { posicaoDe, type Estrategia, type Posicao } from "@zentrade/dominio";
import { operacoesFechadas } from "../historico.js";
import { ajusteDaPosicao, type AjustePosicao } from "./protecao.js";
import type { Dependencias } from "./tipos.js";

interface Abertura {
  readonly decisaoId: string;
  readonly ajuste?: AjustePosicao;
}

/**
 * Acompanha a posição aberta: qual compra a abriu (para gravar o desfecho quando ela
 * fechar) e o stop/alvo efetivos dela. Em memória durante o processo; depois de um
 * reinício, relê a compra executada mais recente pela porta (o banco guarda a
 * proteção efetiva na decisão), então o stop do agente não se perde.
 */
export class PosicaoAberta {
  /** `undefined` = ainda não sabe (início ou depois de reconciliar uma ordem). */
  private abertura: Abertura | null | undefined = undefined;

  constructor(
    private readonly robo: RoboConfig,
    private readonly deps: Dependencias,
  ) {}

  /** A estratégia que vale para a posição: a do robô com o stop/alvo efetivos da compra. */
  async estrategia(posicao: Posicao): Promise<Estrategia> {
    if (posicao.quantidade.isZero()) {
      this.abertura = null;
      return this.robo.estrategia;
    }
    const abertura = await this.conhecida();
    return abertura?.ajuste ? { ...this.robo.estrategia, ...abertura.ajuste } : this.robo.estrategia;
  }

  /** A compra executou neste processo: já se sabe quem abriu e com que proteção. */
  aoComprar(decisaoId: string, ajuste: AjustePosicao | undefined): void {
    this.abertura = { decisaoId, ...(ajuste ? { ajuste } : {}) };
  }

  /** Uma ordem incerta foi resolvida por fora: relê da porta na próxima vez. */
  esquecer(): void {
    this.abertura = undefined;
  }

  /**
   * Depois de uma venda executada: se a posição zerou, grava o desfecho (resultado
   * líquido da ida e volta, com as duas taxas) na compra que abriu. `true` se zerou.
   */
  async aoVender(): Promise<boolean> {
    const execucoes = await this.deps.ordens.execucoes(this.robo.id);
    if (!posicaoDe(execucoes).quantidade.isZero()) return false;
    const abertura = await this.conhecida();
    const operacao = operacoesFechadas(execucoes).at(-1);
    this.abertura = null;
    if (!abertura || !operacao) {
      this.deps.registro.warn(
        { roboId: this.robo.id },
        "posição fechada sem a compra que a abriu no diário: desfecho não gravado",
      );
      return true;
    }
    await this.deps.decisoes.registrarDesfecho(
      abertura.decisaoId,
      operacao.resultado,
      this.deps.relogio.agora(),
    );
    return true;
  }

  private async conhecida(): Promise<Abertura | null> {
    if (this.abertura !== undefined) return this.abertura;
    const compra = await this.deps.decisoes.ultimaCompraExecutada(this.robo.id);
    this.abertura = !compra
      ? null
      : {
          decisaoId: compra.decisaoId,
          ...(compra.protecao
            ? { ajuste: ajusteDaPosicao(compra.protecao, compra.preco, this.robo.estrategia.taxa) }
            : {}),
        };
    return this.abertura;
  }
}
