import type { AvisoDTO, GravidadeAlerta, TipoAlerta } from "@zentrade/contratos";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { ms } from "../conversao.js";
import { umaLinha } from "../erros.js";
import { avisos } from "../esquema/index.js";

export interface NovoAviso {
  readonly tipo: TipoAlerta;
  readonly gravidade: GravidadeAlerta;
  readonly titulo: string;
  readonly mensagem: string;
  readonly chave: string;
  readonly roboId?: string;
  readonly em: number;
}

const LIMITE_LISTA = 100;

function avisoDeLinha(l: typeof avisos.$inferSelect): AvisoDTO {
  return {
    id: l.id,
    tipo: l.tipo,
    gravidade: l.gravidade,
    titulo: l.titulo,
    mensagem: l.mensagem,
    roboId: l.roboId,
    criadoEm: ms(l.criadoEm),
    lidoEm: l.lidoEm ? ms(l.lidoEm) : null,
    enviado: l.enviado,
  };
}

/** Os avisos da tela (alertas já deduplicados pela API), sempre sob RLS. */
export function repositorioAvisos(db: Db) {
  return {
    gravar: (usuarioId: string, a: NovoAviso): Promise<AvisoDTO> =>
      comoUsuario(db, usuarioId, async (tx) =>
        avisoDeLinha(
          umaLinha(
            await tx
              .insert(avisos)
              .values({
                usuarioId,
                tipo: a.tipo,
                gravidade: a.gravidade,
                titulo: a.titulo,
                mensagem: a.mensagem,
                chave: a.chave,
                roboId: a.roboId ?? null,
                criadoEm: new Date(a.em),
              })
              .returning(),
          ),
        ),
      ),

    marcarEnviado: (usuarioId: string, id: string): Promise<void> =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx.update(avisos).set({ enviado: true }).where(eq(avisos.id, id));
      }),

    /** Quantos foram ao Telegram desde `desde`: o teto por pessoa contra enxurrada. */
    enviadosDesde: (usuarioId: string, desde: number): Promise<number> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [r] = await tx
          .select({ n: count() })
          .from(avisos)
          .where(and(eq(avisos.enviado, true), gte(avisos.criadoEm, new Date(desde))));
        return r?.n ?? 0;
      }),

    listar: (usuarioId: string, limite = 50): Promise<AvisoDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx
            .select()
            .from(avisos)
            .orderBy(desc(avisos.criadoEm))
            .limit(Math.min(Math.max(limite, 1), LIMITE_LISTA))
        ).map(avisoDeLinha),
      ),

    /** Marca todos os não lidos como lidos agora; devolve quantos mudaram. */
    marcarLidos: (usuarioId: string, agora: number): Promise<number> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const lidos = await tx
          .update(avisos)
          .set({ lidoEm: new Date(agora) })
          .where(isNull(avisos.lidoEm))
          .returning({ id: avisos.id });
        return lidos.length;
      }),
  };
}

export type RepositorioAvisos = ReturnType<typeof repositorioAvisos>;
