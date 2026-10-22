import {
  CenarioDoAtivoEsquema,
  PensamentoEsquema,
  type CenarioDoAtivoDTO,
  type PensamentoAtualDTO,
  type PensamentoHistoricoDTO,
} from "@zentrade/contratos";
import { desc, eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { pensamentosAtuais, pensamentosHistorico, robos } from "../esquema/index.js";
import { limitar } from "./lista.js";

/** O jsonb gravado pelo motor, conferido contra o contrato ao sair. */
const ler = (bruto: unknown) => PensamentoEsquema.parse(bruto);

/** Vários robôs no mesmo ativo e intervalo dão um cenário só: o da leitura mais recente. */
export function cenariosDosAtuais(atuais: readonly PensamentoAtualDTO[]): CenarioDoAtivoDTO[] {
  const porAtivo = new Map<string, CenarioDoAtivoDTO>();
  for (const a of atuais) {
    const chave = `${a.simbolo}:${a.intervalo}`;
    const existente = porAtivo.get(chave);
    const roboIds = [...(existente?.roboIds ?? []), a.roboId];
    if (existente && existente.em >= a.pensamento.em) {
      porAtivo.set(chave, { ...existente, roboIds });
      continue;
    }
    porAtivo.set(
      chave,
      CenarioDoAtivoEsquema.parse({
        simbolo: a.simbolo,
        intervalo: a.intervalo,
        roboIds,
        em: a.pensamento.em,
        preco: a.pensamento.preco,
        cenario: a.pensamento.cenario,
      }),
    );
  }
  return [...porAtivo.values()];
}

/** O pensamento dos robôs como a pessoa vê: sempre sob RLS. */
export function repositorioPensamentos(db: Db) {
  const atuais = (usuarioId: string): Promise<PensamentoAtualDTO[]> =>
    comoUsuario(db, usuarioId, async (tx) => {
      const linhas = await tx
        .select({ r: robos, p: pensamentosAtuais })
        .from(pensamentosAtuais)
        .innerJoin(robos, eq(robos.id, pensamentosAtuais.roboId))
        .orderBy(desc(pensamentosAtuais.em));
      return linhas.map(({ r, p }) => ({
        roboId: r.id,
        simbolo: r.simbolo,
        intervalo: r.intervalo,
        pensamento: ler(p.pensamento),
      }));
    });

  return {
    /** A última leitura de cada robô da pessoa que já pensou alguma vez. */
    atuais,

    /** O histórico curto de um robô (primeira leitura, mudanças de cenário e sinais), do mais novo ao mais velho. */
    historico: (usuarioId: string, roboId: string, limite?: number): Promise<PensamentoHistoricoDTO[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select()
          .from(pensamentosHistorico)
          .where(eq(pensamentosHistorico.roboId, roboId))
          .orderBy(desc(pensamentosHistorico.em), desc(pensamentosHistorico.id))
          .limit(limitar(limite));
        return linhas.map((l) => ({ motivo: l.motivo, pensamento: ler(l.pensamento) }));
      }),

    /** O cenário atual por ativo e intervalo, só dos robôs da pessoa. */
    cenarios: async (usuarioId: string): Promise<CenarioDoAtivoDTO[]> =>
      cenariosDosAtuais(await atuais(usuarioId)),
  };
}

export type RepositorioPensamentos = ReturnType<typeof repositorioPensamentos>;
