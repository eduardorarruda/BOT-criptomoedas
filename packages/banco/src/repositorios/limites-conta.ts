import { LIMITES_CONTA_PADRAO, type LimitesContaDTO } from "@zentrade/contratos";
import { dec, type LimitesConta } from "@zentrade/dominio";
import { eq } from "drizzle-orm";
import { comoUsuario, type Db, type Executor } from "../cliente.js";
import { decimalTexto, ms } from "../conversao.js";
import { limitesConta } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

const HORA_MS = 3_600_000;

type LinhaLimites = typeof limitesConta.$inferSelect;

/** Os limites gravados, como a API e a tela os veem; quem nunca configurou recebe o padrão. */
export interface LimitesGravados {
  readonly limites: LimitesContaDTO;
  /** Última liberação manual das pausas (queda e sequência de stops). */
  readonly liberadaEm: number | null;
}

const textoOuNulo = (v: string | null): string | null => (v === null ? null : decimalTexto(v));

export function limitesDeLinha(l: LinhaLimites | undefined): LimitesGravados {
  if (!l) return { limites: LIMITES_CONTA_PADRAO, liberadaEm: null };
  return {
    limites: {
      perdaDiariaMaxima: textoOuNulo(l.perdaDiariaMaxima),
      incluirNaoRealizado: l.incluirNaoRealizado,
      exposicaoMaxima: textoOuNulo(l.exposicaoMaxima),
      posicoesAbertasMax: l.posicoesAbertasMax,
      quedaMaxima: textoOuNulo(l.quedaMaxima),
      quedaJanelaHoras: l.quedaJanelaHoras,
      sequenciaStopsMax: l.sequenciaStopsMax,
      sequenciaStopsJanelaHoras: l.sequenciaStopsJanelaHoras,
      sequenciaStopsEscopo: l.sequenciaStopsEscopo,
      orcamentoIaMensalUsd: textoOuNulo(l.orcamentoIaMensalUsd),
      orcamentoIaDiarioUsd: textoOuNulo(l.orcamentoIaDiarioUsd),
    },
    liberadaEm: l.liberadaEm ? ms(l.liberadaEm) : null,
  };
}

const valorOuNulo = (t: string | null) => (t === null ? null : dec(t));

/** Do DTO (texto, horas) para o domínio (decimais, milissegundos). */
export function limitesDominio(l: LimitesContaDTO): LimitesConta {
  return {
    perdaDiariaMaxima: valorOuNulo(l.perdaDiariaMaxima),
    incluirNaoRealizado: l.incluirNaoRealizado,
    exposicaoMaxima: valorOuNulo(l.exposicaoMaxima),
    posicoesAbertasMax: l.posicoesAbertasMax,
    quedaMaxima: valorOuNulo(l.quedaMaxima),
    quedaJanelaMs: l.quedaJanelaHoras * HORA_MS,
    sequenciaStopsMax: l.sequenciaStopsMax,
    sequenciaStopsJanelaMs: l.sequenciaStopsJanelaHoras * HORA_MS,
    sequenciaStopsEscopo: l.sequenciaStopsEscopo,
  };
}

/** Lê na transação de quem chama (já sob RLS). */
export async function lerLimites(executor: Executor, usuarioId: string): Promise<LimitesGravados> {
  const [linha] = await executor.select().from(limitesConta).where(eq(limitesConta.usuarioId, usuarioId));
  return limitesDeLinha(linha);
}

export function repositorioLimitesConta(db: Db) {
  return {
    obter: (usuarioId: string): Promise<LimitesGravados> =>
      comoUsuario(db, usuarioId, (tx) => lerLimites(tx, usuarioId)),

    /** Grava todos os limites de uma vez (o formulário manda o conjunto) e audita. */
    definir: (usuarioId: string, l: LimitesContaDTO): Promise<LimitesGravados> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const valores = { ...l, atualizadaEm: new Date() };
        const [linha] = await tx
          .insert(limitesConta)
          .values({ usuarioId, ...valores })
          .onConflictDoUpdate({ target: limitesConta.usuarioId, set: valores })
          .returning();
        await auditar(tx, usuarioId, "limites_conta_alterados", undefined, { ...l });
        return limitesDeLinha(linha);
      }),

    /**
     * "Liberar agora": o pico da queda e as perdas da sequência de stops anteriores a
     * `agora` deixam de contar. Não mexe na perda do dia nem nas divergências.
     */
    liberar: (usuarioId: string, agora: number): Promise<LimitesGravados> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const em = new Date(agora);
        const [linha] = await tx
          .insert(limitesConta)
          .values({ usuarioId, liberadaEm: em })
          .onConflictDoUpdate({ target: limitesConta.usuarioId, set: { liberadaEm: em, atualizadaEm: em } })
          .returning();
        await auditar(tx, usuarioId, "pausas_conta_liberadas", undefined, { em: agora });
        return limitesDeLinha(linha);
      }),
  };
}

export type RepositorioLimitesConta = ReturnType<typeof repositorioLimitesConta>;
