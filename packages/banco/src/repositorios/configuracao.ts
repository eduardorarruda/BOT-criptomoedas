import { eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { configuracaoGlobal } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

export function repositorioConfiguracao(db: Db) {
  return {
    paradaTotal: (usuarioId: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [c] = await tx
          .select({ ligada: configuracaoGlobal.paradaTotal })
          .from(configuracaoGlobal)
          .where(eq(configuracaoGlobal.usuarioId, usuarioId));
        return c?.ligada ?? false;
      }),

    definirParadaTotal: (usuarioId: string, ligada: boolean): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx
          .insert(configuracaoGlobal)
          .values({ usuarioId, paradaTotal: ligada })
          .onConflictDoUpdate({
            target: configuracaoGlobal.usuarioId,
            set: { paradaTotal: ligada, atualizadaEm: new Date() },
          });
        await auditar(tx, usuarioId, ligada ? "parada_total_ligada" : "parada_total_desligada");
        return ligada;
      }),
  };
}

export type RepositorioConfiguracao = ReturnType<typeof repositorioConfiguracao>;
