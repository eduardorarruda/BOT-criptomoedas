import { dec, deveZerar, diaB3, precoExecutado, type Candle, type Valor } from "@zentrade/dominio";
import type { ResultadoBuyHold } from "../buy-hold.js";
import type { PontoCurva } from "../metricas.js";
import { custoDeUmLado } from "./execucao.js";
import { resultadoEmReais, type ModeloWin } from "./modelo.js";

/**
 * Referência do mini índice. Comprar no início e segurar não faz sentido num futuro
 * de day trade (não se dorme posicionado, e o contrato vence). As duas referências
 * honestas são:
 *   - ficar de fora: resultado zero, sem custo nenhum (a estratégia precisa bater isso);
 *   - "sempre comprado na sessão": 1 contrato comprado na abertura do primeiro candle
 *     de cada pregão e zerado onde a estratégia zeraria (hora da zeragem ou último
 *     candle do dia), com os MESMOS custos (tarifa, corretagem, ticks).
 * Esta função calcula a segunda; a curva entra onde o cripto põe o buy and hold.
 */
export type ReferenciaSessao = ResultadoBuyHold;

interface Comprado {
  readonly entrada: Valor;
  readonly contratos: number;
}

export function referenciaDaSessao(janela: readonly Candle[], saldo: Valor, m: ModeloWin): ReferenciaSessao {
  let caixa = saldo;
  let posicao: Comprado | null = null;
  const curva: PontoCurva[] = janela.map((c, k) => {
    const dia = diaB3(c.abertura);
    const anterior = janela[k - 1];
    const proximo = janela[k + 1];
    if (!posicao && (!anterior || diaB3(anterior.abertura) !== dia)) {
      const contratos = Math.min(1, caixa.div(m.margemPorContrato).floor().toNumber());
      if (contratos > 0) {
        posicao = { entrada: precoExecutado(c.abre, "COMPRA", m.custos.deslizamentoTicks), contratos };
        caixa = caixa.minus(custoDeUmLado(m, contratos));
      }
    }
    const ultimo = !proximo || diaB3(proximo.abertura) !== dia || deveZerar(c.fechamento + 1, m.sessao);
    if (posicao && ultimo) {
      const saida = precoExecutado(c.fecha, "VENDA", m.custos.deslizamentoTicks);
      caixa = caixa
        .plus(resultadoEmReais("comprado", posicao.entrada, saida, posicao.contratos))
        .minus(custoDeUmLado(m, posicao.contratos));
      posicao = null;
    }
    const aberto: Valor = posicao
      ? resultadoEmReais("comprado", (posicao as Comprado).entrada, c.fecha, (posicao as Comprado).contratos)
      : dec(0);
    return { em: c.fechamento, patrimonio: caixa.plus(aberto) };
  });
  return { curva, final: curva.at(-1)?.patrimonio ?? saldo };
}
