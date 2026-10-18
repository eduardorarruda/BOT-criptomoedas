import type { PropostaAgente } from "@zentrade/contratos";
import { dec, mercadoDoSimbolo, type DecisaoPlacar } from "@zentrade/dominio";
import { and, desc, eq, gte, isNotNull, sql, type SQL } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { fracao, ms } from "../conversao.js";
import { avaliacoesDecisao, decisoes, estrategias, robos } from "../esquema/index.js";

export interface FiltroPlacarBanco {
  readonly roboId?: string;
  readonly desde?: number;
}

/** O bastante para meses de sinais; o placar pesa as mais recentes. */
export const LIMITE_PLACAR = 5000;

const veredicto = (p: PropostaAgente): DecisaoPlacar["claude"] =>
  p.acao === "comprar" ? "aprovou" : "vetou";

/**
 * As decisões do placar da pessoa, sob RLS: toda entrada com proposta do agente, com a
 * avaliação quando já existe (sem ela, conta como pendente). Da mais nova para a mais velha.
 */
export function repositorioPlacar(db: Db) {
  return {
    decisoes: (usuarioId: string, f: FiltroPlacarBanco = {}): Promise<DecisaoPlacar[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const condicoes: SQL[] = [isNotNull(decisoes.proposta), sql`${decisoes.sinal}->>'acao' = 'COMPRAR'`];
        if (f.roboId) condicoes.push(eq(decisoes.roboId, f.roboId));
        if (f.desde !== undefined) condicoes.push(gte(decisoes.em, new Date(f.desde)));
        const linhas = await tx
          .select({ d: decisoes, a: avaliacoesDecisao, r: robos, estrategia: estrategias.nome })
          .from(decisoes)
          .innerJoin(robos, eq(robos.id, decisoes.roboId))
          .innerJoin(estrategias, eq(estrategias.id, robos.estrategiaId))
          .leftJoin(avaliacoesDecisao, eq(avaliacoesDecisao.decisaoId, decisoes.id))
          .where(and(...condicoes))
          .orderBy(desc(decisoes.em))
          .limit(LIMITE_PLACAR);
        return linhas.map(({ d, a, r, estrategia }) => {
          const proposta = d.proposta as PropostaAgente;
          const mercado = mercadoDoSimbolo(r.simbolo);
          const concluida = a?.situacao === "concluida" && a.resultado !== null && a.retorno !== null;
          return {
            id: d.id,
            em: ms(d.em),
            claude: a?.claude ?? veredicto(proposta),
            confianca: a ? fracao(a.confianca) : proposta.confianca,
            fonte: a?.fonte ?? "contrafactual",
            resultado: concluida ? dec(a.resultado as string) : null,
            retorno: concluida ? Number(a.retorno) : null,
            moeda: a?.moeda ?? (mercado === "win" ? "BRL" : "USDT"),
            roboId: r.id,
            roboNome: r.nome,
            estrategiaId: r.estrategiaId,
            estrategiaNome: estrategia,
            mercado,
          };
        });
      }),
  };
}

export type RepositorioPlacar = ReturnType<typeof repositorioPlacar>;
