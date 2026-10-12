import { randomBytes } from "node:crypto";
import type { DivergenciaDTO, RedeConta } from "@zentrade/contratos";
import { paraTexto, type Valor } from "@zentrade/dominio";
import { and, desc, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { decimalTexto, ms } from "../conversao.js";
import { ErroDados, umaLinha } from "../erros.js";
import { decisoes, divergenciasSaldo, execucoes, ordens, robos } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

/** Divergência como o banco guarda; a API acrescenta os robôs afetados. */
export type DivergenciaGravada = Omit<DivergenciaDTO, "robos">;

/** Um ativo conferido: o que os robôs registram e o que a corretora tem. */
export interface ConferenciaAtivo {
  readonly ativo: string;
  readonly esperado: Valor;
  readonly naCorretora: Valor;
  readonly falta: Valor;
  readonly divergente: boolean;
}

export interface ResultadoRegistro {
  /** Divergências que não estavam abertas: viram alerta. */
  readonly novas: readonly DivergenciaGravada[];
  /** Abertas que deixaram de faltar (o saldo voltou ou a posição fechou). */
  readonly resolvidas: number;
}

/** Baixa contábil numa posição de robô ao aceitar o saldo da corretora. */
export interface AjusteDePosicao {
  readonly roboId: string;
  readonly simbolo: string;
  readonly quantidade: Valor;
  /** O preço médio da posição: a baixa não gera ganho nem perda. */
  readonly preco: Valor;
}

export interface Aceite {
  readonly porQuem: string;
  readonly agora: number;
  readonly ajustes: readonly AjusteDePosicao[];
}

const RESOLVIDA_POR_CONFERENCIA = "conferencia";
const JANELA_LISTA_MS = 30 * 86_400_000;

function divergenciaDeLinha(l: typeof divergenciasSaldo.$inferSelect): DivergenciaGravada {
  return {
    id: l.id,
    rede: l.rede,
    ativo: l.ativo,
    esperado: decimalTexto(l.esperado),
    naCorretora: decimalTexto(l.naCorretora),
    falta: decimalTexto(l.falta),
    estado: l.estado,
    detectadaEm: ms(l.detectadaEm),
    atualizadaEm: ms(l.atualizadaEm),
    resolvidaEm: l.resolvidaEm ? ms(l.resolvidaEm) : null,
    resolvidaPor: l.resolvidaPor,
  };
}

async function abrirOuAtualizar(
  tx: Tx,
  usuarioId: string,
  rede: RedeConta,
  c: ConferenciaAtivo,
  em: Date,
): Promise<DivergenciaGravada | null> {
  const valores = {
    esperado: paraTexto(c.esperado),
    naCorretora: paraTexto(c.naCorretora),
    falta: paraTexto(c.falta),
    atualizadaEm: em,
  };
  const atualizadas = await tx
    .update(divergenciasSaldo)
    .set(valores)
    .where(
      and(
        eq(divergenciasSaldo.rede, rede),
        eq(divergenciasSaldo.ativo, c.ativo),
        eq(divergenciasSaldo.estado, "aberta"),
      ),
    )
    .returning({ id: divergenciasSaldo.id });
  if (atualizadas.length > 0) return null;
  const linha = umaLinha(
    await tx
      .insert(divergenciasSaldo)
      .values({ usuarioId, rede, ativo: c.ativo, detectadaEm: em, ...valores })
      .returning(),
  );
  return divergenciaDeLinha(linha);
}

/** Decisão, ordem e execução da baixa: a posição derivada passa a bater com a corretora. */
async function gravarAjuste(tx: Tx, usuarioId: string, a: AjusteDePosicao, aceite: Aceite, ativo: string) {
  const em = new Date(aceite.agora);
  const explicacao = `Ajuste de reconciliação: ${paraTexto(a.quantidade)} ${ativo} baixados para bater com o saldo da corretora (aceito por ${aceite.porQuem}). Nenhuma ordem foi enviada.`;
  const quantidade = paraTexto(a.quantidade);
  const preco = paraTexto(a.preco);
  const decisao = umaLinha(
    await tx
      .insert(decisoes)
      .values({
        usuarioId,
        roboId: a.roboId,
        em,
        sinal: { acao: "VENDER", motivo: "ajuste", explicacao },
        preco,
        quantidade,
        risco: { aprovada: true, barreiras: [] },
        estado: "executada",
        decididaPor: aceite.porQuem,
      })
      .returning({ id: decisoes.id }),
  );
  const ordem = umaLinha(
    await tx
      .insert(ordens)
      .values({
        usuarioId,
        roboId: a.roboId,
        decisaoId: decisao.id,
        idCliente: `zt-aj-${randomBytes(15).toString("hex")}`,
        simbolo: a.simbolo,
        lado: "VENDA",
        quantidade,
        estado: "PREENCHIDA",
        motivo: explicacao,
      })
      .returning({ id: ordens.id }),
  );
  await tx
    .insert(execucoes)
    .values({ usuarioId, ordemId: ordem.id, sequencia: 0, preco, quantidade, taxaCotacao: "0", em });
}

/** Divergências entre a posição dos robôs e o saldo da corretora, sempre sob RLS. */
export function repositorioDivergencias(db: Db) {
  return {
    /**
     * Acesso de sistema (só ids): as contas (pessoa + rede) que têm robô em testnet ou
     * real. Com `usuarioId`, só as dessa pessoa (a conferência sob demanda).
     */
    async alvos(usuarioId?: string): Promise<{ usuarioId: string; rede: RedeConta }[]> {
      const linhas = await db
        .selectDistinct({ usuarioId: robos.usuarioId, rede: robos.rede })
        .from(robos)
        .where(
          and(
            inArray(robos.rede, ["testnet", "real"]),
            usuarioId ? eq(robos.usuarioId, usuarioId) : undefined,
          ),
        );
      return linhas.flatMap((l) => (l.rede === "papel" ? [] : [{ usuarioId: l.usuarioId, rede: l.rede }]));
    },

    /**
     * Grava o resultado de uma conferência: abre (ou atualiza) as divergentes e resolve
     * as abertas que deixaram de faltar. Ativo não conferido (posição fechada) também
     * resolve: sem posição, não há o que faltar.
     */
    registrar: (
      usuarioId: string,
      rede: RedeConta,
      conferencias: readonly ConferenciaAtivo[],
      agora: number,
    ): Promise<ResultadoRegistro> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const em = new Date(agora);
        const novas: DivergenciaGravada[] = [];
        const divergentes = conferencias.filter((c) => c.divergente);
        for (const c of divergentes) {
          const nova = await abrirOuAtualizar(tx, usuarioId, rede, c, em);
          if (nova) novas.push(nova);
        }
        const ativos = divergentes.map((c) => c.ativo);
        const resolvidas = await tx
          .update(divergenciasSaldo)
          .set({
            estado: "resolvida",
            resolvidaEm: em,
            resolvidaPor: RESOLVIDA_POR_CONFERENCIA,
            atualizadaEm: em,
          })
          .where(
            and(
              eq(divergenciasSaldo.rede, rede),
              eq(divergenciasSaldo.estado, "aberta"),
              ativos.length > 0 ? notInArray(divergenciasSaldo.ativo, ativos) : sql`true`,
            ),
          )
          .returning({ id: divergenciasSaldo.id });
        return { novas, resolvidas: resolvidas.length };
      }),

    /** As abertas e as dos últimos 30 dias, abertas primeiro. */
    listar: (usuarioId: string, agora: number): Promise<DivergenciaGravada[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx
            .select()
            .from(divergenciasSaldo)
            .where(
              or(
                eq(divergenciasSaldo.estado, "aberta"),
                gte(divergenciasSaldo.atualizadaEm, new Date(agora - JANELA_LISTA_MS)),
              ),
            )
            .orderBy(sql`${divergenciasSaldo.estado} = 'aberta' desc`, desc(divergenciasSaldo.detectadaEm))
            .limit(100)
        ).map(divergenciaDeLinha),
      ),

    obter: (usuarioId: string, id: string): Promise<DivergenciaGravada | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [l] = await tx.select().from(divergenciasSaldo).where(eq(divergenciasSaldo.id, id));
        return l ? divergenciaDeLinha(l) : null;
      }),

    /**
     * "Aceitar o saldo da corretora": grava a baixa nas posições dos robôs (sem ordem
     * na corretora, ao preço médio: sem ganho nem perda), fecha a divergência e audita.
     * Tudo numa transação: ou a posição e a divergência mudam juntas, ou nada muda.
     */
    aceitar: (usuarioId: string, id: string, aceite: Aceite): Promise<DivergenciaGravada> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [d] = await tx
          .select()
          .from(divergenciasSaldo)
          .where(eq(divergenciasSaldo.id, id))
          .for("update");
        if (!d) throw new ErroDados("nao_encontrado", "divergência não encontrada");
        if (d.estado !== "aberta")
          throw new ErroDados(
            "estado_invalido",
            `a divergência já está ${d.estado}; confira de novo antes de aceitar`,
          );
        for (const a of aceite.ajustes) await gravarAjuste(tx, usuarioId, a, aceite, d.ativo);
        const em = new Date(aceite.agora);
        const [linha] = await tx
          .update(divergenciasSaldo)
          .set({ estado: "aceita", resolvidaEm: em, resolvidaPor: aceite.porQuem, atualizadaEm: em })
          .where(eq(divergenciasSaldo.id, id))
          .returning();
        await auditar(tx, usuarioId, "divergencia_aceita", id, {
          ativo: d.ativo,
          rede: d.rede,
          falta: decimalTexto(d.falta),
          ajustes: aceite.ajustes.map((a) => ({ roboId: a.roboId, quantidade: paraTexto(a.quantidade) })),
        });
        return divergenciaDeLinha(umaLinha(linha ? [linha] : []));
      }),
  };
}

export type RepositorioDivergencias = ReturnType<typeof repositorioDivergencias>;
