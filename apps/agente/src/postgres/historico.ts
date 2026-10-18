import { acertou, dec, mercadoDoSimbolo, type DecisaoPlacar } from "@zentrade/dominio";
import type { Sql } from "postgres";
import type { AvaliacaoPassada, DecisaoPassada, PortaHistoricoDecisoes } from "../ferramentas/index.js";

/**
 * Leitura simples das tabelas `decisoes` e `avaliacoes_decisao` de packages/banco
 * (esquema/operacao.ts e esquema/placar.ts): o desfecho de uma compra executada fica
 * nas colunas `resultado` e `avaliada_em` da decisão; o placar do Claude (real ou
 * contrafactual, gravado pelo avaliador do motor) fica em `avaliacoes_decisao`.
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
  readonly claude: AvaliacaoPassada["claude"] | null;
  readonly situacao: AvaliacaoPassada["situacao"] | null;
  readonly fonte: AvaliacaoPassada["fonte"] | null;
  readonly resultado_placar: string | null;
}

interface LinhaPlacar {
  readonly id: string;
  readonly em: Date;
  readonly robo_id: string;
  readonly simbolo: string;
  readonly acao_proposta: string;
  readonly confianca: string;
  readonly claude: AvaliacaoPassada["claude"] | null;
  readonly situacao: AvaliacaoPassada["situacao"] | null;
  readonly fonte: AvaliacaoPassada["fonte"] | null;
  readonly resultado: string | null;
  readonly retorno: string | null;
  readonly moeda: string | null;
}

function avaliacaoDe(l: Linha): AvaliacaoPassada | null {
  if (!l.claude || !l.situacao || !l.fonte) return null;
  const resultado = l.resultado_placar === null ? null : dec(l.resultado_placar);
  const concluida = l.situacao === "concluida" && resultado !== null;
  return {
    claude: l.claude,
    situacao: l.situacao,
    fonte: l.fonte,
    resultado,
    acertou: concluida ? acertou(l.claude, resultado) : null,
  };
}

function decisaoDoPlacar(l: LinhaPlacar): DecisaoPlacar {
  const concluida = l.situacao === "concluida" && l.resultado !== null && l.retorno !== null;
  return {
    id: l.id,
    em: l.em.getTime(),
    claude: l.claude ?? (l.acao_proposta === "comprar" ? "aprovou" : "vetou"),
    confianca: Number(l.confianca),
    fonte: l.fonte ?? "contrafactual",
    resultado: concluida ? dec(l.resultado as string) : null,
    retorno: concluida ? Number(l.retorno) : null,
    moeda: l.moeda ?? "",
    roboId: l.robo_id,
    roboNome: l.robo_id,
    estrategiaId: "",
    estrategiaNome: "",
    mercado: mercadoDoSimbolo(l.simbolo),
  };
}

export function criarHistoricoPostgres(sql: Sql): PortaHistoricoDecisoes {
  return {
    async recentes(roboId, limite) {
      const linhas = await sql<Linha[]>`
        select d.id::text, d.em, d.sinal->>'acao' as sinal_acao, d.sinal->>'explicacao' as explicacao,
               d.proposta->>'acao' as acao_proposta, d.estado, d.preco::text, d.resultado::text as resultado,
               a.claude, a.situacao, a.fonte, a.resultado::text as resultado_placar
        from decisoes d
        left join avaliacoes_decisao a on a.decisao_id = d.id
        where d.robo_id = ${roboId}
        order by d.em desc
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
        avaliacao: avaliacaoDe(l),
      }));
    },

    /** As entradas que passaram pelo Claude (com proposta), avaliadas ou não, das mais novas. */
    async placar(roboId, limite) {
      const linhas = await sql<LinhaPlacar[]>`
        select d.id::text, d.em, d.robo_id::text, r.simbolo, d.proposta->>'acao' as acao_proposta,
               coalesce(a.confianca::text, d.proposta->>'confianca', '0') as confianca, a.claude, a.situacao, a.fonte,
               a.resultado::text as resultado, a.retorno::text as retorno, a.moeda
        from decisoes d
        join robos r on r.id = d.robo_id
        left join avaliacoes_decisao a on a.decisao_id = d.id
        where d.robo_id = ${roboId} and d.proposta is not null and d.sinal->>'acao' = 'COMPRAR'
        order by d.em desc
        limit ${limite}`;
      return linhas.map(decisaoDoPlacar);
    },
  };
}
