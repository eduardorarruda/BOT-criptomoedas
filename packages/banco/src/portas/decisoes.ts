import type { EstadoDecisao, NovaDecisao, PortaDecisoes } from "@zentrade/contratos";
import { paraTexto, type Sinal } from "@zentrade/dominio";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { iso } from "../conversao.js";
import { ErroDados } from "../erros.js";
import { decisoes, robos } from "../esquema/index.js";

/** Sinal com decimais em texto: o jsonb não guarda Decimal. */
function sinalGravavel(s: Sinal): Record<string, string> {
  switch (s.acao) {
    case "COMPRAR":
      return { acao: s.acao, explicacao: s.explicacao, stop: paraTexto(s.stop), alvo: paraTexto(s.alvo) };
    case "VENDER":
      return { acao: s.acao, explicacao: s.explicacao, motivo: s.motivo };
    case "AGUARDAR":
      return { acao: s.acao, explicacao: s.explicacao };
  }
}

const textoOuNulo = (v: NovaDecisao["quantidade"]): string | null => (v ? paraTexto(v) : null);

export interface OpcoesPortaDecisoes {
  /** Quanto tempo uma decisão em `aguardando_aprovacao` vale. Padrão: 15 minutos. */
  readonly validadeAprovacaoMs?: number;
}

export const VALIDADE_APROVACAO_PADRAO_MS = 15 * 60_000;

export function portaDecisoes(db: Db, opcoes: OpcoesPortaDecisoes = {}): PortaDecisoes {
  const validade = opcoes.validadeAprovacaoMs ?? VALIDADE_APROVACAO_PADRAO_MS;
  return {
    async registrar(d: NovaDecisao): Promise<string> {
      // A dona vem do robô: o motor não precisa (nem pode) dizer de quem é a decisão.
      const linhas = await db.execute<{ id: string }>(sql`
        insert into decisoes (usuario_id, robo_id, em, sinal, proposta, quantidade, preco, risco, estado, custo_ia_usd, expira_em)
        select r.usuario_id, r.id, ${iso(d.em)}::timestamptz, ${JSON.stringify(sinalGravavel(d.sinal))}::jsonb, ${d.proposta ? JSON.stringify(d.proposta) : null}::jsonb,
               ${textoOuNulo(d.quantidade)}::numeric, ${paraTexto(d.preco)}::numeric, ${JSON.stringify(d.risco)}::jsonb, ${d.estado},
               ${textoOuNulo(d.custoIaUsd)}::numeric,
               ${d.estado === "aguardando_aprovacao" ? iso(d.em + validade) : null}::timestamptz
        from ${robos} r where r.id = ${d.roboId}
        returning id`);
      const [linha] = linhas;
      if (!linha)
        throw new ErroDados("nao_encontrado", `o robô ${d.roboId} não existe; a decisão não foi registrada`);
      return linha.id;
    },

    async mudarEstado(id: string, estado: EstadoDecisao): Promise<void> {
      const mudadas = await db
        .update(decisoes)
        .set({ estado, atualizadaEm: new Date() })
        .where(eq(decisoes.id, id))
        .returning({ id: decisoes.id });
      if (mudadas.length === 0) throw new ErroDados("nao_encontrado", `a decisão ${id} não existe`);
    },

    /** Antes de ler, vence o prazo de aprovação se já passou: o motor nunca executa aprovação vencida. */
    async estado(id: string): Promise<EstadoDecisao | null> {
      await db
        .update(decisoes)
        .set({ estado: "expirada", atualizadaEm: new Date() })
        .where(
          and(
            eq(decisoes.id, id),
            eq(decisoes.estado, "aguardando_aprovacao"),
            sql`${decisoes.expiraEm} <= now()`,
          ),
        );
      const [d] = await db.select({ estado: decisoes.estado }).from(decisoes).where(eq(decisoes.id, id));
      return d?.estado ?? null;
    },
  };
}
