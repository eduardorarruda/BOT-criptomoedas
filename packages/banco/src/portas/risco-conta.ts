import type { PortaRiscoConta } from "@zentrade/contratos";
import { dec, FUSO_PADRAO, type EstadoConta } from "@zentrade/dominio";
import { and, eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { ms } from "../conversao.js";
import { ErroDados } from "../erros.js";
import { divergenciasSaldo, robos } from "../esquema/index.js";
import { lerLimites, limitesDominio } from "../repositorios/limites-conta.js";
import { retratoDaConta } from "../repositorios/retrato-conta.js";

/** O ativo-base do par ("BTCUSDT" → "BTC"); quem sabe as cotações é a corretora. */
export type AtivoDoSimbolo = (simbolo: string) => string;

/**
 * Estado da conta para as barreiras da conta (motor). Acha a dona do robô (acesso de
 * sistema, só o id) e lê o resto como ela, sob RLS: um bug aqui não soma robôs de outra
 * pessoa. A conta é a pessoa NA REDE do robô: papel, testnet e real não se misturam.
 * O "dia" da perda diária é o do `fuso` da instância (ZENTRADE_FUSO).
 */
export function portaRiscoConta(
  db: Db,
  ativoDe: AtivoDoSimbolo,
  fuso: string = FUSO_PADRAO,
): PortaRiscoConta {
  return {
    async estado(roboId: string, agora: number): Promise<EstadoConta> {
      const [robo] = await db
        .select({ usuarioId: robos.usuarioId, rede: robos.rede, simbolo: robos.simbolo })
        .from(robos)
        .where(eq(robos.id, roboId));
      if (!robo) throw new ErroDados("nao_encontrado", `o robô ${roboId} não existe`);
      return comoUsuario(db, robo.usuarioId, async (tx) => {
        const { limites, liberadaEm } = await lerLimites(tx, robo.usuarioId);
        const l = limitesDominio(limites);
        const desde = agora - Math.max(l.quedaJanelaMs, l.sequenciaStopsJanelaMs);
        const retrato = await retratoDaConta(tx, robo.rede, agora, desde, fuso);
        const divergencias =
          robo.rede === "papel"
            ? []
            : await tx
                .select()
                .from(divergenciasSaldo)
                .where(
                  and(
                    eq(divergenciasSaldo.estado, "aberta"),
                    eq(divergenciasSaldo.rede, robo.rede),
                    eq(divergenciasSaldo.ativo, ativoDe(robo.simbolo)),
                  ),
                );
        const doRobo = retrato.robos.find((r) => r.id === roboId);
        return {
          limites: l,
          agora,
          realizadoDoDia: retrato.realizadoDoDia,
          naoRealizado: retrato.naoRealizado,
          exposicao: retrato.exposicao,
          posicoesAbertas: retrato.posicoesAbertas,
          roboTemPosicao: doRobo ? doRobo.quantidade.gt(0) : false,
          resultados: retrato.resultados,
          saidasComPerdaConta: retrato.saidasComPerda.map((s) => s.em),
          saidasComPerdaRobo: retrato.saidasComPerda.filter((s) => s.roboId === roboId).map((s) => s.em),
          liberadaEm,
          divergencias: divergencias.map((d) => ({
            ativo: d.ativo,
            falta: dec(d.falta),
            detectadaEm: ms(d.detectadaEm),
          })),
        };
      });
    },
  };
}
