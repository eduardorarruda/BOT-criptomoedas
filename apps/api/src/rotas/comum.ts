import { z } from "zod";
import { naoEncontrado } from "../erros.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ParamId = z.object({ id: z.string().max(64) });

/** Id que não é UUID não existe: 404, sem chegar ao banco. */
export function exigirUuid(id: string, oQue: string): string {
  if (!UUID.test(id)) throw naoEncontrado(oQue);
  return id;
}

/** Devolve o valor ou 404. */
export function ouNaoEncontrado<T>(valor: T | null, oQue: string): T {
  if (valor === null) throw naoEncontrado(oQue);
  return valor;
}
