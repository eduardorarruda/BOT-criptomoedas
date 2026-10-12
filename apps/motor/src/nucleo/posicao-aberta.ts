import type { RoboConfig } from "@zentrade/contratos";
import {
  posicaoDe,
  precoAlvo,
  precoStop,
  type Estrategia,
  type Posicao,
  type Valor,
} from "@zentrade/dominio";
import { operacoesFechadas } from "../historico.js";
import { ajusteDaPosicao, type AjustePosicao } from "./protecao.js";
import type { Dependencias } from "./tipos.js";

/** O stop e o alvo efetivos da posição aberta, em preço, e a compra que a abriu. */
export interface ProtecaoEfetiva {
  readonly decisaoId: string;
  readonly stop: Valor;
  readonly alvo: Valor;
}

/**
 * Grava o desfecho da ida e volta (resultado líquido, com as duas taxas) na compra que a
 * abriu. Chamado quando a posição zera — pela venda do robô ou pela da corretora.
 */
export async function gravarDesfecho(deps: Dependencias, roboId: string, decisaoId: string): Promise<void> {
  const operacao = operacoesFechadas(await deps.ordens.execucoes(roboId)).at(-1);
  if (!operacao) return;
  await deps.decisoes.registrarDesfecho(decisaoId, operacao.resultado, deps.relogio.agora());
}

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

  /**
   * O "stop efetivo" da posição: as MESMAS contas de `decidir` sobre a estratégia que vale
   * para ela (`estrategia`). É o que vai para a corretora; quem mudar o stop da posição
   * aberta (agente apertando, stop móvel) muda aqui e a proteção no livro acompanha.
   * `null` sem posição ou sem a compra que a abriu no diário.
   */
  async protecaoEfetiva(posicao: Posicao): Promise<ProtecaoEfetiva | null> {
    const e = await this.estrategia(posicao);
    const abertura = this.abertura;
    if (!abertura) return null;
    return {
      decisaoId: abertura.decisaoId,
      stop: precoStop(posicao.precoMedio, e.stop),
      alvo: precoAlvo(posicao.precoMedio, e.alvoLiquido, e.taxa),
    };
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
    this.abertura = null;
    if (!abertura || operacoesFechadas(execucoes).length === 0) {
      this.deps.registro.warn(
        { roboId: this.robo.id },
        "posição fechada sem a compra que a abriu no diário: desfecho não gravado",
      );
      return true;
    }
    await gravarDesfecho(this.deps, this.robo.id, abertura.decisaoId);
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
