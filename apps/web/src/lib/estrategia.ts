import type { EstrategiaDTO } from "@zentrade/contratos";
import type { Estrategia } from "@zentrade/dominio";

/** O DTO tem `saida?: Regra | undefined`; o domínio quer a chave ausente quando não há saída. */
export function paraDominio(
  e: Pick<EstrategiaDTO, "entrada" | "saida" | "stop" | "alvoLiquido" | "taxa">,
): Estrategia {
  const base = { entrada: e.entrada, stop: e.stop, alvoLiquido: e.alvoLiquido, taxa: e.taxa };
  return e.saida ? { ...base, saida: e.saida } : base;
}
