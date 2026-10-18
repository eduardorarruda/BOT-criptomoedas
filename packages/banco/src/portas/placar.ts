import type {
  CandidataAvaliacao,
  EstadoDecisao,
  NovaAvaliacao,
  PortaPlacar,
  PropostaAgente,
} from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import { and, asc, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { estrategiaDominio } from "../conversao.js";
import { avaliacoesDecisao, decisoes, estrategiaVersoes, robos } from "../esquema/index.js";

const decimalOuNulo = (v: string | null): Valor | null => (v === null ? null : dec(v));
const textoOuNulo = (v: Valor | undefined): string | null => (v ? paraTexto(v) : null);

/** O índice parcial `decisoes_placar` cobre exatamente este filtro. */
const ehEntradaComProposta = and(isNotNull(decisoes.proposta), sql`${decisoes.sinal}->>'acao' = 'COMPRAR'`);

/**
 * O placar do Claude visto pelo avaliador do motor: acesso de sistema (todas as
 * pessoas), como as demais portas do motor. Quem lê pela tela usa o repositório, sob RLS.
 */
export function portaPlacar(db: Db): PortaPlacar {
  return {
    async candidatas(f): Promise<CandidataAvaliacao[]> {
      const linhas = await db
        .select({ d: decisoes, r: robos, v: estrategiaVersoes, avaliada: avaliacoesDecisao.decisaoId })
        .from(decisoes)
        .innerJoin(robos, eq(robos.id, decisoes.roboId))
        .innerJoin(
          estrategiaVersoes,
          and(
            eq(estrategiaVersoes.estrategiaId, robos.estrategiaId),
            eq(estrategiaVersoes.versao, robos.estrategiaVersao),
          ),
        )
        .leftJoin(avaliacoesDecisao, eq(avaliacoesDecisao.decisaoId, decisoes.id))
        .where(
          and(
            ehEntradaComProposta,
            gte(decisoes.em, new Date(f.desde)),
            or(
              isNull(avaliacoesDecisao.decisaoId),
              and(
                eq(avaliacoesDecisao.situacao, "pendente"),
                lt(avaliacoesDecisao.avaliadaEm, new Date(f.revisarAntesDe)),
              ),
            ),
          ),
        )
        // As nunca avaliadas primeiro: uma fila de pendentes não segura as novas.
        .orderBy(sql`${avaliacoesDecisao.decisaoId} is not null`, asc(decisoes.em))
        .limit(f.limite);
      return linhas.map(({ d, r, v }) => ({
        decisaoId: d.id,
        usuarioId: d.usuarioId,
        roboId: d.roboId,
        simbolo: r.simbolo,
        intervalo: r.intervalo,
        em: d.em.getTime(),
        preco: dec(d.preco),
        quantidade: decimalOuNulo(d.quantidade),
        estado: d.estado as EstadoDecisao,
        proposta: d.proposta as PropostaAgente,
        protecao:
          d.stopEfetivo !== null && d.alvoEfetivo !== null
            ? { stop: dec(d.stopEfetivo), alvo: dec(d.alvoEfetivo) }
            : null,
        resultadoReal: d.avaliadaEm !== null ? decimalOuNulo(d.resultado) : null,
        estrategia: estrategiaDominio(v),
        riscoPorOperacao: dec(r.riscoPorOperacao),
        exposicaoMaxima: dec(r.exposicaoMaxima),
      }));
    },

    async gravar(a: NovaAvaliacao): Promise<void> {
      const valores = {
        decisaoId: a.decisaoId,
        usuarioId: a.usuarioId,
        claude: a.claude,
        confianca: String(a.confianca),
        fonte: a.fonte,
        situacao: a.situacao,
        motivo: a.motivo ?? null,
        quantidade: textoOuNulo(a.quantidade),
        precoEntrada: textoOuNulo(a.precoEntrada),
        precoSaida: textoOuNulo(a.precoSaida),
        resultado: textoOuNulo(a.resultado),
        retorno: a.retorno === undefined ? null : String(a.retorno),
        barras: a.barras,
        moeda: a.moeda,
        avaliadaEm: new Date(a.em),
      };
      const { decisaoId: _id, usuarioId: _usuario, ...mudancas } = valores;
      await db
        .insert(avaliacoesDecisao)
        .values(valores)
        .onConflictDoUpdate({
          target: avaliacoesDecisao.decisaoId,
          set: mudancas,
          // Concluída não muda mais: rodar o avaliador de novo não reescreve o placar.
          setWhere: eq(avaliacoesDecisao.situacao, "pendente"),
        });
    },
  };
}
