import { EstrategiaEsquema, type EstrategiaDTO } from "@zentrade/contratos";
import { validarEstrategia } from "@zentrade/dominio";
import { and, asc, eq, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { estrategiaDeLinha } from "../conversao.js";
import { ErroDados, umaLinha } from "../erros.js";
import { estrategias, estrategiaVersoes } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

export type DadosEstrategia = Omit<EstrategiaDTO, "id" | "versao">;

export interface DetalheEstrategia {
  readonly estrategia: EstrategiaDTO;
  readonly versoes: EstrategiaDTO[];
}

const DadosEsquema = EstrategiaEsquema.omit({ id: true, versao: true });

/** Valida com o mesmo esquema da API e com as regras do domínio antes de gravar. */
export function validarDadosEstrategia(dados: DadosEstrategia): DadosEstrategia {
  const lido = DadosEsquema.safeParse(dados);
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `${i.path.join(".") || "estratégia"}: ${i.message}`);
    throw new ErroDados("invalido", `estratégia inválida: ${problemas.join("; ")}`);
  }
  const { entrada, saida, stop, alvoLiquido, taxa } = lido.data;
  const problemas = validarEstrategia({ entrada, ...(saida ? { saida } : {}), stop, alvoLiquido, taxa });
  if (problemas.length > 0) throw new ErroDados("invalido", `estratégia inválida: ${problemas.join("; ")}`);
  return lido.data;
}

async function gravarVersao(
  tx: Tx,
  usuarioId: string,
  estrategiaId: string,
  versao: number,
  d: DadosEstrategia,
) {
  const linha = umaLinha(
    await tx
      .insert(estrategiaVersoes)
      .values({
        estrategiaId,
        versao,
        usuarioId,
        nome: d.nome,
        regra: { entrada: d.entrada, ...(d.saida ? { saida: d.saida } : {}) },
        stop: String(d.stop),
        alvoLiquido: String(d.alvoLiquido),
        taxa: String(d.taxa),
      })
      .returning(),
  );
  await auditar(tx, usuarioId, "estrategia_versao_criada", estrategiaId, { versao });
  return estrategiaDeLinha(linha);
}

async function versoesDe(tx: Tx, id: string): Promise<EstrategiaDTO[]> {
  const linhas = await tx
    .select()
    .from(estrategiaVersoes)
    .where(eq(estrategiaVersoes.estrategiaId, id))
    .orderBy(asc(estrategiaVersoes.versao));
  return linhas.map(estrategiaDeLinha);
}

export function repositorioEstrategias(db: Db) {
  return {
    /** A versão atual de cada estratégia da pessoa. */
    listar: (usuarioId: string): Promise<EstrategiaDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select({ v: estrategiaVersoes })
          .from(estrategias)
          .innerJoin(
            estrategiaVersoes,
            and(
              eq(estrategiaVersoes.estrategiaId, estrategias.id),
              eq(estrategiaVersoes.versao, estrategias.versaoAtual),
            ),
          )
          .orderBy(asc(estrategias.criadaEm));
        return linhas.map((l) => estrategiaDeLinha(l.v));
      }),

    async criar(usuarioId: string, dados: DadosEstrategia): Promise<EstrategiaDTO> {
      const d = validarDadosEstrategia(dados);
      return comoUsuario(db, usuarioId, async (tx) => {
        const e = umaLinha(
          await tx.insert(estrategias).values({ usuarioId, nome: d.nome }).returning({ id: estrategias.id }),
        );
        return gravarVersao(tx, usuarioId, e.id, 1, d);
      });
    },

    obter: (usuarioId: string, id: string): Promise<DetalheEstrategia | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const versoes = await versoesDe(tx, id);
        const atual = versoes.at(-1);
        return atual ? { estrategia: atual, versoes } : null;
      }),

    /** Versões nunca mudam: editar uma estratégia é criar a próxima versão. */
    async novaVersao(usuarioId: string, id: string, dados: DadosEstrategia): Promise<EstrategiaDTO> {
      const d = validarDadosEstrategia(dados);
      return comoUsuario(db, usuarioId, async (tx) => {
        // O UPDATE trava a linha: duas edições simultâneas recebem versões diferentes.
        const [e] = await tx
          .update(estrategias)
          .set({ versaoAtual: sql`${estrategias.versaoAtual} + 1`, nome: d.nome })
          .where(eq(estrategias.id, id))
          .returning({ versao: estrategias.versaoAtual });
        if (!e) throw new ErroDados("nao_encontrado", "estratégia não encontrada; confira o id");
        return gravarVersao(tx, usuarioId, id, e.versao, d);
      });
    },

    versao: (usuarioId: string, id: string, versao: number): Promise<EstrategiaDTO | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [linha] = await tx
          .select()
          .from(estrategiaVersoes)
          .where(and(eq(estrategiaVersoes.estrategiaId, id), eq(estrategiaVersoes.versao, versao)));
        return linha ? estrategiaDeLinha(linha) : null;
      }),
  };
}

export type RepositorioEstrategias = ReturnType<typeof repositorioEstrategias>;
