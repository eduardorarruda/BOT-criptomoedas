import { dec } from "@zentrade/dominio";
import type { Sql } from "postgres";
import type { DecisaoPassada, PortaHistoricoDecisoes } from "../ferramentas/index.js";

/**
 * Leitura simples da tabela `decisoes` de packages/banco (esquema/operacao.ts): o
 * desfecho de uma compra fica nas colunas `resultado` (numeric) e `avaliada_em`,
 * gravadas pelo motor quando a venda fecha a posição.
 */
interface Linha {
  readonly id: string;
  readonly em: Date;
  readonly sinal_acao: DecisaoPassada["sinal"];
  readonly explicacao: string | null;
  readonly acao_proposta: DecisaoPassada["acaoProposta"];
  readonly estado: string;
  readonly preco: string;
  readonly resultado: string | null;
}

export function criarHistoricoPostgres(sql: Sql): PortaHistoricoDecisoes {
  return {
    async recentes(roboId, limite) {
      const linhas = await sql<Linha[]>`
        select id::text, em, sinal->>'acao' as sinal_acao, sinal->>'explicacao' as explicacao,
               proposta->>'acao' as acao_proposta, estado, preco::text, resultado::text as resultado
        from decisoes
        where robo_id = ${roboId}
        order by em desc
        limit ${limite}`;
      return linhas.map((l) => ({
        id: l.id,
        em: l.em.getTime(),
        sinal: l.sinal_acao,
        acaoProposta: l.acao_proposta,
        estado: l.estado,
        preco: dec(l.preco),
        resultado: l.resultado === null ? null : dec(l.resultado),
        explicacao: l.explicacao ?? "",
      }));
    },
  };
}
