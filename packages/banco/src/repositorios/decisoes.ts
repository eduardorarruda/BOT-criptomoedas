import type { DecisaoDTO, EstadoDecisao, OrdemDTO } from "@zentrade/contratos";
import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { decisaoDeLinha, iso } from "../conversao.js";
import { ErroDados } from "../erros.js";
import { decisoes, ordens, robos } from "../esquema/index.js";
import { auditar } from "./auditoria.js";
import { limitar } from "./lista.js";
import { ordensComExecucoes } from "./ordens.js";

export interface FiltroDecisoes {
  readonly roboId?: string;
  readonly estado?: EstadoDecisao;
  /** Só decisões anteriores a este instante (paginação para trás). */
  readonly antes?: number;
  readonly limite?: number;
}

export interface DecisaoComOrdem extends DecisaoDTO {
  readonly ordem?: OrdemDTO;
}

/** O que o n8n precisa para pedir aprovação humana (PropostaCriada). */
export interface DadosProposta {
  readonly decisaoId: string;
  readonly roboId: string;
  readonly simbolo: string;
  readonly acao: "COMPRAR" | "VENDER" | "AGUARDAR";
  readonly quantidade: string;
  readonly preco: string;
  readonly explicacao: string;
  readonly expiraEm: number;
}

async function obterNa(tx: Tx, id: string): Promise<DecisaoComOrdem | null> {
  const [linha] = await tx.select().from(decisoes).where(eq(decisoes.id, id));
  if (!linha) return null;
  const [ordem] = await ordensComExecucoes(tx, eq(ordens.decisaoId, id), 1);
  return { ...decisaoDeLinha(linha, ordem?.id), ...(ordem ? { ordem } : {}) };
}

/**
 * Aprovar ou recusar: só vale em `aguardando_aprovacao` e antes de expirar. O UPDATE
 * condicional resolve corrida entre a tela e o n8n — quem chegar depois recebe erro.
 * Devolve o erro em vez de lançar: a marcação de "expirada" precisa ser gravada.
 */
async function decidirNa(
  tx: Tx,
  id: string,
  aprovada: boolean,
  porQuem: string,
  agora: number,
): Promise<DecisaoDTO | ErroDados> {
  const [linha] = await tx
    .update(decisoes)
    .set({ estado: aprovada ? "aprovada" : "recusada", decididaPor: porQuem, atualizadaEm: new Date(agora) })
    .where(
      and(
        eq(decisoes.id, id),
        eq(decisoes.estado, "aguardando_aprovacao"),
        sql`(${decisoes.expiraEm} is null or ${decisoes.expiraEm} > ${iso(agora)}::timestamptz)`,
      ),
    )
    .returning();
  if (linha) {
    await auditar(tx, linha.usuarioId, aprovada ? "decisao_aprovada" : "decisao_recusada", id, { porQuem });
    return decisaoDeLinha(linha);
  }
  const atual = await obterNa(tx, id);
  if (!atual) return new ErroDados("nao_encontrado", "decisão não encontrada; confira o id");
  if (atual.estado === "aguardando_aprovacao") {
    await tx.update(decisoes).set({ estado: "expirada" }).where(eq(decisoes.id, id));
    return new ErroDados(
      "expirada",
      "o prazo para aprovar esta decisão já passou; ela foi marcada como expirada",
    );
  }
  return new ErroDados(
    "estado_invalido",
    `esta decisão já está "${atual.estado}" e não pode mais ser aprovada ou recusada`,
  );
}

const lancarSeErro = (r: DecisaoDTO | ErroDados): DecisaoDTO => {
  if (r instanceof ErroDados) throw r;
  return r;
};

export function repositorioDecisoes(db: Db) {
  return {
    listar: (usuarioId: string, f: FiltroDecisoes = {}): Promise<DecisaoDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const condicoes: SQL[] = [];
        if (f.roboId) condicoes.push(eq(decisoes.roboId, f.roboId));
        if (f.estado) condicoes.push(eq(decisoes.estado, f.estado));
        if (f.antes !== undefined) condicoes.push(lt(decisoes.em, new Date(f.antes)));
        const linhas = await tx
          .select({ d: decisoes, ordemId: ordens.id })
          .from(decisoes)
          .leftJoin(ordens, eq(ordens.decisaoId, decisoes.id))
          .where(and(...condicoes))
          .orderBy(desc(decisoes.em))
          .limit(limitar(f.limite));
        return linhas.map((l) => decisaoDeLinha(l.d, l.ordemId ?? undefined));
      }),

    obter: (usuarioId: string, id: string): Promise<DecisaoComOrdem | null> =>
      comoUsuario(db, usuarioId, (tx) => obterNa(tx, id)),

    decidir: async (usuarioId: string, id: string, aprovada: boolean, porQuem: string, agora: number) =>
      lancarSeErro(await comoUsuario(db, usuarioId, (tx) => decidirNa(tx, id, aprovada, porQuem, agora))),

    /** Sistema (webhook do n8n, sem sessão): acha a dona pela decisão e decide como ela. */
    async decidirComoSistema(
      id: string,
      aprovada: boolean,
      porQuem: string,
      agora: number,
    ): Promise<DecisaoDTO> {
      const [d] = await db
        .select({ usuarioId: decisoes.usuarioId })
        .from(decisoes)
        .where(eq(decisoes.id, id));
      if (!d) throw new ErroDados("nao_encontrado", "decisão não encontrada; confira o id");
      return lancarSeErro(
        await comoUsuario(db, d.usuarioId, (tx) => decidirNa(tx, id, aprovada, porQuem, agora)),
      );
    },

    /** Sistema: dados para mandar a proposta ao n8n. */
    async paraProposta(id: string): Promise<DadosProposta | null> {
      const [l] = await db
        .select({ d: decisoes, simbolo: robos.simbolo })
        .from(decisoes)
        .innerJoin(robos, eq(robos.id, decisoes.roboId))
        .where(eq(decisoes.id, id));
      if (!l?.d.expiraEm || l.d.quantidade === null) return null;
      const dto = decisaoDeLinha(l.d);
      return {
        decisaoId: id,
        roboId: dto.roboId,
        simbolo: l.simbolo,
        acao: dto.sinal.acao,
        quantidade: dto.quantidade ?? "0",
        preco: dto.preco,
        explicacao: dto.proposta?.justificativa ?? dto.sinal.explicacao,
        expiraEm: l.d.expiraEm.getTime(),
      };
    },

    custoIaDesde: (usuarioId: string, desdeMs: number): Promise<string> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [r] = await tx
          .select({ total: sql<string>`coalesce(sum(${decisoes.custoIaUsd}), 0)::text` })
          .from(decisoes)
          .where(sql`${decisoes.em} >= ${iso(desdeMs)}::timestamptz`);
        return r?.total ?? "0";
      }),
  };
}

export type RepositorioDecisoes = ReturnType<typeof repositorioDecisoes>;
