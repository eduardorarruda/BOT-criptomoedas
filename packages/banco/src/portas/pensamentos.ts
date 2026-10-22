import { LIMITE_HISTORICO_PENSAMENTO, type PortaPensamentos } from "@zentrade/contratos";
import type { PensamentoRobo } from "@zentrade/dominio";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { ErroDados } from "../erros.js";
import { pensamentosAtuais, pensamentosHistorico, robos } from "../esquema/index.js";

type Motivo = "inicio" | "cenario" | "sinal";

/** Primeira leitura, cenário que mudou ou sinal de operar: o que vale guardar no histórico curto. */
function motivoDoHistorico(anterior: string | undefined, p: PensamentoRobo): Motivo | null {
  if (anterior === undefined) return "inicio";
  if (anterior !== p.cenario.cenario) return "cenario";
  return p.sinal === "AGUARDAR" ? null : "sinal";
}

/**
 * O pensamento do robô gravado pelo motor (acesso de sistema, como as demais portas).
 * A dona vem do robô: o motor não diz de quem é. Uma transação por vela fechada:
 * upsert da última leitura e, se for o caso, uma linha no histórico (com o teto por robô).
 */
export function portaPensamentos(db: Db): PortaPensamentos {
  return {
    registrar: (roboId: string, p: PensamentoRobo): Promise<void> =>
      db.transaction(async (tx) => {
        const [robo] = await tx
          .select({ usuarioId: robos.usuarioId })
          .from(robos)
          .where(eq(robos.id, roboId));
        if (!robo) throw new ErroDados("nao_encontrado", `o robô ${roboId} não existe`);
        const [anterior] = await tx
          .select({ cenario: pensamentosAtuais.cenario })
          .from(pensamentosAtuais)
          .where(eq(pensamentosAtuais.roboId, roboId));
        const linha = {
          em: new Date(p.em),
          cenario: p.cenario.cenario,
          sinal: p.sinal,
          pensamento: p,
        };
        await tx
          .insert(pensamentosAtuais)
          .values({ roboId, usuarioId: robo.usuarioId, ...linha })
          .onConflictDoUpdate({
            target: pensamentosAtuais.roboId,
            set: { ...linha, atualizadoEm: new Date() },
          });
        const motivo = motivoDoHistorico(anterior?.cenario, p);
        if (!motivo) return;
        await tx.insert(pensamentosHistorico).values({ roboId, usuarioId: robo.usuarioId, motivo, ...linha });
        // Teto por robô: as leituras além das LIMITE_HISTORICO_PENSAMENTO mais novas saem do histórico.
        await tx.execute(sql`
          delete from pensamentos_historico
          where id in (
            select id from pensamentos_historico where robo_id = ${roboId}
            order by em desc, id desc offset ${LIMITE_HISTORICO_PENSAMENTO})`);
      }),
  };
}
