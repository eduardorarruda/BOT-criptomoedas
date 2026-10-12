import type {
  EstadoProtecaoGravada,
  NovaProtecao,
  PortaProtecoes,
  ProtecaoGravada,
  SaidaProtecao,
} from "@zentrade/contratos";
import { dec, paraTexto } from "@zentrade/dominio";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "../cliente.js";
import { ErroDados } from "../erros.js";
import { execucoes, ordens, protecoesCorretora, robos } from "../esquema/index.js";
import { inserirDecisao, VALIDADE_APROVACAO_PADRAO_MS } from "./decisoes.js";
import { linhaExecucao } from "./ordens.js";

type Linha = typeof protecoesCorretora.$inferSelect;

const VIVAS: EstadoProtecaoGravada[] = ["PENDENTE", "ATIVA"];

export function protecaoDeLinha(l: Linha): ProtecaoGravada {
  return {
    roboId: l.roboId,
    decisaoId: l.decisaoId,
    simbolo: l.simbolo,
    ids: { lista: l.idLista, stop: l.idStop, ...(l.idAlvo ? { alvo: l.idAlvo } : {}) },
    quantidade: dec(l.quantidade),
    stop: dec(l.stop),
    limite: dec(l.limite),
    ...(l.alvo !== null ? { alvo: dec(l.alvo) } : {}),
    estado: l.estado,
    idCorretora: l.idCorretora,
    ...(l.motivo !== null ? { motivo: l.motivo } : {}),
    criadaEm: l.criadaEm.getTime(),
    atualizadaEm: l.atualizadaEm.getTime(),
  };
}

/** A ordem da perna: a existente (reconclusão) ou uma nova, com a decisão de venda no diário. */
async function ordemDaPerna(
  tx: Tx,
  p: Linha,
  s: SaidaProtecao,
  validade: number,
): Promise<{ ordemId: string; decisaoId: string; nova: boolean }> {
  const [existente] = await tx
    .select({ id: ordens.id, decisaoId: ordens.decisaoId })
    .from(ordens)
    .where(eq(ordens.idCliente, s.ordem.idCliente));
  if (existente) return { ordemId: existente.id, decisaoId: existente.decisaoId, nova: false };
  const decisaoId = await inserirDecisao(tx, { ...s.decisao, roboId: p.roboId }, validade);
  const [ordem] = await tx
    .insert(ordens)
    .values({
      usuarioId: p.usuarioId,
      roboId: p.roboId,
      decisaoId,
      idCliente: s.ordem.idCliente,
      simbolo: p.simbolo,
      lado: "VENDA",
      quantidade: paraTexto(s.quantidade),
    })
    .returning({ id: ordens.id });
  if (!ordem) throw new ErroDados("nao_encontrado", `a ordem da perna ${s.ordem.idCliente} não foi gravada`);
  return { ordemId: ordem.id, decisaoId, nova: true };
}

/**
 * Proteções na corretora (acesso de sistema: o motor roda para todas as pessoas).
 * A venda que a proteção fez entra como as outras ordens — decisão, ordem e execuções —
 * porque a posição sai das execuções (ADR 003).
 */
export function portaProtecoes(db: Db, opcoes: { validadeAprovacaoMs?: number } = {}): PortaProtecoes {
  const validade = opcoes.validadeAprovacaoMs ?? VALIDADE_APROVACAO_PADRAO_MS;
  const maisRecente = async (filtro: SQL | undefined): Promise<ProtecaoGravada | null> => {
    const [l] = await db
      .select()
      .from(protecoesCorretora)
      .where(filtro)
      .orderBy(desc(protecoesCorretora.criadaEm))
      .limit(1);
    return l ? protecaoDeLinha(l) : null;
  };
  return {
    /** ON CONFLICT sem alvo cobre o id repetido e o índice "uma viva por robô". */
    async reservar(p: NovaProtecao): Promise<"nova" | "ja_existe"> {
      const texto = (v: NovaProtecao["alvo"]) => (v ? paraTexto(v) : null);
      const inseridas = await db.execute<{ id: string }>(sql`
        insert into protecoes_corretora
          (usuario_id, robo_id, decisao_id, simbolo, id_lista, id_stop, id_alvo, quantidade, stop, limite, alvo)
        select r.usuario_id, r.id, ${p.decisaoId}, ${p.simbolo}, ${p.ids.lista}, ${p.ids.stop}, ${p.ids.alvo ?? null},
               ${paraTexto(p.quantidade)}::numeric, ${paraTexto(p.stop)}::numeric, ${paraTexto(p.limite)}::numeric,
               ${texto(p.alvo)}::numeric
        from ${robos} r where r.id = ${p.roboId}
        on conflict do nothing
        returning id`);
      if (inseridas.length > 0) return "nova";
      const [robo] = await db.select({ id: robos.id }).from(robos).where(eq(robos.id, p.roboId));
      if (!robo)
        throw new ErroDados("nao_encontrado", `o robô ${p.roboId} não existe; a proteção não foi reservada`);
      return "ja_existe";
    },

    viva: (roboId: string) =>
      maisRecente(and(eq(protecoesCorretora.roboId, roboId), inArray(protecoesCorretora.estado, VIVAS))),

    ultima: (roboId: string) => maisRecente(eq(protecoesCorretora.roboId, roboId)),

    async atualizar(idLista, estado, extra = {}): Promise<void> {
      const mudadas = await db
        .update(protecoesCorretora)
        .set({
          estado,
          ...(extra.idCorretora !== undefined ? { idCorretora: extra.idCorretora } : {}),
          ...(extra.motivo !== undefined ? { motivo: extra.motivo } : {}),
          atualizadaEm: new Date(),
        })
        .where(eq(protecoesCorretora.idLista, idLista))
        .returning({ id: protecoesCorretora.id });
      if (mudadas.length === 0) throw new ErroDados("nao_encontrado", `a proteção ${idLista} não existe`);
    },

    /** Numa transação, com a linha da proteção travada: duas conferências ao mesmo tempo não duplicam a venda. */
    registrarSaida(idLista: string, s: SaidaProtecao) {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select()
          .from(protecoesCorretora)
          .where(eq(protecoesCorretora.idLista, idLista))
          .for("update");
        if (!p)
          throw new ErroDados("nao_encontrado", `a proteção ${idLista} não existe; a venda não foi gravada`);
        const { ordemId, decisaoId, nova } = await ordemDaPerna(tx, p, s, validade);
        await tx
          .update(ordens)
          .set({
            estado: s.ordem.estado,
            idCorretora: s.ordem.idCorretora,
            motivo: s.ordem.motivo ?? null,
            atualizadaEm: new Date(),
          })
          .where(eq(ordens.id, ordemId));
        if (s.ordem.execucoes.length > 0)
          await tx
            .insert(execucoes)
            .values(
              s.ordem.execucoes.map((e, i) => linhaExecucao({ id: ordemId, usuarioId: p.usuarioId }, i, e)),
            )
            .onConflictDoNothing({ target: [execucoes.ordemId, execucoes.sequencia] });
        return { decisaoId, nova };
      });
    },
  };
}
