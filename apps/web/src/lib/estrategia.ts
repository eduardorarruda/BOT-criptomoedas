import { estrategiaDoDTO, type CamposEstrategia } from "@zentrade/contratos/esquemas";
import type { ContextoMercado, Estrategia } from "@zentrade/dominio";
import type { CandleApi } from "../api/esquemas";

/** O DTO aceita `campo: undefined` nos opcionais; o domínio quer a chave ausente. */
export const paraDominio = (e: CamposEstrategia): Estrategia => estrategiaDoDTO(e);

/** Velas da API (texto decimal) → contexto das regras. Indicador é análise: vira número aqui. */
export function contextoDeVelas(velas: readonly CandleApi[]): ContextoMercado {
  return {
    fechamentos: velas.map((v) => Number(v.fecha)),
    aberturas: velas.map((v) => Number(v.abre)),
    maximas: velas.map((v) => Number(v.maxima)),
    minimas: velas.map((v) => Number(v.minima)),
    volumes: velas.map((v) => Number(v.volume)),
    // A regra de horário (e o VWAP do dia) leem a abertura de cada vela.
    instantes: velas.map((v) => v.abertura),
  };
}
