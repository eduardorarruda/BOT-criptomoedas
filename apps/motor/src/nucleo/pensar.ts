import { MS_POR_INTERVALO, type RoboConfig } from "@zentrade/contratos";
import {
  montarPensamento,
  type Acompanhamento,
  type ContextoMercado,
  type Estrategia,
  type PensamentoRobo,
  type Posicao,
  type Sinal,
  type Valor,
} from "@zentrade/dominio";
import { publicar } from "./diario.js";
import type { Dependencias } from "./tipos.js";

/** O pensamento do robô neste candle (puro e barato: zero IA, zero consulta externa). */
export function pensamentoDoCandle(
  robo: RoboConfig,
  e: {
    readonly estrategia: Estrategia;
    readonly sinal: Sinal;
    readonly ctx: ContextoMercado & { readonly preco: Valor; readonly acompanhamento?: Acompanhamento };
    readonly posicao: Posicao;
    readonly em: number;
  },
): PensamentoRobo {
  return montarPensamento({
    estrategia: e.estrategia,
    sinal: e.sinal,
    ctx: e.ctx,
    preco: e.ctx.preco,
    em: e.em,
    intervaloMs: MS_POR_INTERVALO[robo.intervalo],
    posicionado: e.posicao.quantidade.gt(0),
    agente: robo.limites.agente ?? "decide",
  });
}

/**
 * Guarda a última leitura (e o histórico curto) e avisa a tela "Ao vivo". Falhar aqui
 * nunca derruba nem atrasa a decisão: o erro vai para o registro e a vela segue.
 */
export async function registrarPensamento(
  deps: Dependencias,
  robo: RoboConfig,
  pensamento: PensamentoRobo,
): Promise<void> {
  const gravar = async () => {
    try {
      await deps.pensamentos?.registrar(robo.id, pensamento);
    } catch (erro) {
      deps.registro.error({ erro, roboId: robo.id }, "falha ao guardar o pensamento do robô");
    }
  };
  await Promise.all([gravar(), publicar(deps, { tipo: "pensamento", roboId: robo.id, pensamento })]);
}
