import { dec } from "@zentrade/dominio";
import type { Sql } from "postgres";
import type { DecisaoPassada, PortaHistoricoDecisoes } from "../ferramentas/index.js";

/**
 * Leitura simples da tabela `decisoes`. O esquema é de packages/banco e ainda não está
 * no contrato; supomos as colunas do DecisaoDTO em snake_case, com os objetos em
 * jsonb: id, robo_id, em timestamptz, sinal jsonb, proposta jsonb, preco numeric,
 * estado text, desfecho jsonb ({ resultado, avaliadoEm }). Se o banco for diferente,
 * só esta consulta muda.
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
               proposta->>'acao' as acao_proposta, estado, preco::text, desfecho->>'resultado' as resultado
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
