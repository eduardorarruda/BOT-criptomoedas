import type { LimitesRiscoDTO, ModoRobo, PosicaoDTO, RoboDTO } from "@zentrade/contratos";
import { direcaoDe, paraTexto, posicaoDe, type Direcao } from "@zentrade/dominio";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { roboDeLinha } from "../conversao.js";
import { codigoPostgres, ErroDados, umaLinha, VIOLACAO_CHAVE_ESTRANGEIRA } from "../erros.js";
import { estrategiaVersoes, protecoesCorretora, robos } from "../esquema/index.js";
import { protecaoCorretoraDTO } from "../conversao.js";
import { auditar } from "./auditoria.js";
import { execucoesDoRobo } from "./execucoes.js";

export type NovoRobo = Omit<RoboDTO, "id" | "criadoEm" | "pausado">;

export interface MudancaRobo {
  readonly nome?: string;
  readonly modo?: ModoRobo;
  readonly limites?: LimitesRiscoDTO;
  readonly pausado?: boolean;
}

const colunasDosLimites = (l: LimitesRiscoDTO) => ({
  perdaDiariaMaxima: l.perdaDiariaMaxima,
  exposicaoMaxima: l.exposicaoMaxima,
  riscoPorOperacao: l.riscoPorOperacao,
  ordensPorHoraMax: l.ordensPorHoraMax,
  pausaAposPerdaMin: l.pausaAposPerdaMin,
  confiancaMinima: String(l.confiancaMinima),
  diasDeEvento: l.diasDeEvento,
});

async function obterNa(tx: Tx, id: string): Promise<RoboDTO | null> {
  const [linha] = await tx.select().from(robos).where(eq(robos.id, id));
  return linha ? roboDeLinha(linha) : null;
}

/**
 * O robô opera o à vista de cripto, que só compra: estratégia vendida ou nos dois
 * sentidos (feita para o backtest do mini índice) não vira robô. Versão inexistente
 * fica para a chave estrangeira, que dá a mensagem de sempre.
 */
async function exigirComprada(tx: Tx, r: NovoRobo): Promise<void> {
  const [versao] = await tx
    .select({ regra: estrategiaVersoes.regra })
    .from(estrategiaVersoes)
    .where(
      and(
        eq(estrategiaVersoes.estrategiaId, r.estrategiaId),
        eq(estrategiaVersoes.versao, r.estrategiaVersao),
      ),
    );
  if (versao && direcaoDe(versao.regra as { direcao?: Direcao }) !== "comprado")
    throw new ErroDados(
      "invalido",
      "o robô opera o mercado à vista de cripto, que só compra; esta estratégia vende a descoberto e roda só no backtest do mini índice",
    );
}

export function repositorioRobos(db: Db) {
  async function inserir(usuarioId: string, r: NovoRobo): Promise<RoboDTO> {
    return comoUsuario(db, usuarioId, async (tx) => {
      await exigirComprada(tx, r);
      const linha = umaLinha(
        await tx
          .insert(robos)
          .values({
            usuarioId,
            nome: r.nome,
            simbolo: r.simbolo,
            intervalo: r.intervalo,
            // Robô novo nasce observando: operar é uma decisão posterior e explícita.
            modo: "observar",
            rede: r.rede,
            estrategiaId: r.estrategiaId,
            estrategiaVersao: r.estrategiaVersao,
            ...colunasDosLimites(r.limites),
          })
          .returning(),
      );
      await auditar(tx, usuarioId, "robo_criado", linha.id, { rede: r.rede, simbolo: r.simbolo });
      return roboDeLinha(linha);
    });
  }

  return {
    listar: (usuarioId: string): Promise<RoboDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (await tx.select().from(robos).orderBy(asc(robos.criadoEm))).map(roboDeLinha),
      ),

    obter: (usuarioId: string, id: string): Promise<RoboDTO | null> =>
      comoUsuario(db, usuarioId, (tx) => obterNa(tx, id)),

    async criar(usuarioId: string, r: NovoRobo): Promise<RoboDTO> {
      try {
        return await inserir(usuarioId, r);
      } catch (erro) {
        if (codigoPostgres(erro) === VIOLACAO_CHAVE_ESTRANGEIRA) {
          throw new ErroDados(
            "invalido",
            `a estratégia ${r.estrategiaId} versão ${r.estrategiaVersao} não existe entre as suas; crie ou escolha outra`,
          );
        }
        throw erro;
      }
    },

    atualizar: (usuarioId: string, id: string, m: MudancaRobo): Promise<RoboDTO | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const mudancas = {
          ...(m.nome !== undefined ? { nome: m.nome } : {}),
          ...(m.modo !== undefined ? { modo: m.modo } : {}),
          ...(m.pausado !== undefined ? { pausado: m.pausado } : {}),
          ...(m.limites ? colunasDosLimites(m.limites) : {}),
        };
        if (Object.keys(mudancas).length === 0) return obterNa(tx, id);
        const [linha] = await tx.update(robos).set(mudancas).where(eq(robos.id, id)).returning();
        if (!linha) return null;
        await auditar(tx, usuarioId, "robo_alterado", id, { ...m });
        return roboDeLinha(linha);
      }),

    /** Posição derivada das execuções confirmadas (não existe tabela de posição). */
    posicao: (usuarioId: string, roboId: string): Promise<PosicaoDTO | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const robo = await obterNa(tx, roboId);
        if (!robo) return null;
        const p = posicaoDe(await execucoesDoRobo(tx, roboId));
        const [protecao] = await tx
          .select()
          .from(protecoesCorretora)
          .where(eq(protecoesCorretora.roboId, roboId))
          .orderBy(desc(protecoesCorretora.criadaEm))
          .limit(1);
        return {
          roboId,
          simbolo: robo.simbolo,
          quantidade: paraTexto(p.quantidade),
          precoMedio: paraTexto(p.precoMedio),
          resultadoRealizado: paraTexto(p.resultadoRealizado),
          taxasPagas: paraTexto(p.taxasPagas),
          ...(protecao ? { protecaoCorretora: protecaoCorretoraDTO(protecao) } : {}),
        };
      }),

    contarAtivos: (usuarioId: string): Promise<number> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [r] = await tx.select({ n: count() }).from(robos).where(eq(robos.pausado, false));
        return r?.n ?? 0;
      }),

    /** Sistema (vigia de saúde do n8n): quantos robôs estão pausados, de todas as pessoas. */
    async contarPausados(): Promise<number> {
      const [r] = await db.select({ n: count() }).from(robos).where(eq(robos.pausado, true));
      return r?.n ?? 0;
    },
  };
}

export type RepositorioRobos = ReturnType<typeof repositorioRobos>;
