import type { Rede } from "@zentrade/contratos";
import { eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { robos } from "../esquema/index.js";
import { lerUsoOrcamento, type UsoOrcamentoIa } from "./gastos-ia.js";
import { lerLimites, limitesDominio, type LimitesGravados } from "./limites-conta.js";
import { retratoDaConta, type RetratoConta, type RoboDoRetrato } from "./retrato-conta.js";

/** O que a tela de Risco precisa para montar a situação da conta (a API aplica as regras do domínio). */
export interface DadosSituacaoConta extends LimitesGravados {
  /** Uma fotografia por rede em que a pessoa tem robô. */
  readonly retratos: readonly RetratoConta[];
  readonly orcamento: UsoOrcamentoIa;
}

const ORDEM_REDES: readonly Rede[] = ["real", "testnet", "papel"];

export function repositorioRiscoConta(db: Db) {
  return {
    situacao: (usuarioId: string, agora: number): Promise<DadosSituacaoConta> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const gravados = await lerLimites(tx, usuarioId);
        const l = limitesDominio(gravados.limites);
        const desde = agora - Math.max(l.quedaJanelaMs, l.sequenciaStopsJanelaMs);
        const redes = new Set((await tx.selectDistinct({ rede: robos.rede }).from(robos)).map((r) => r.rede));
        const retratos: RetratoConta[] = [];
        for (const rede of ORDEM_REDES.filter((r) => redes.has(r)))
          retratos.push(await retratoDaConta(tx, rede, agora, desde));
        return { ...gravados, retratos, orcamento: await lerUsoOrcamento(tx, usuarioId, agora) };
      }),

    /** Os robôs da pessoa na rede, com a posição de cada um (para a reconciliação). */
    posicoes: (usuarioId: string, rede: Rede, agora: number): Promise<readonly RoboDoRetrato[]> =>
      comoUsuario(db, usuarioId, async (tx) => (await retratoDaConta(tx, rede, agora, agora)).robos),

    /** Robôs da pessoa (id e nome) de uma rede: para dizer quem uma divergência afeta. */
    robosDaRede: (usuarioId: string, rede: Rede) =>
      comoUsuario(db, usuarioId, (tx) =>
        tx
          .select({ id: robos.id, nome: robos.nome, simbolo: robos.simbolo })
          .from(robos)
          .where(eq(robos.rede, rede)),
      ),
  };
}

export type RepositorioRiscoConta = ReturnType<typeof repositorioRiscoConta>;
