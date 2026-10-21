import { z } from "zod";

/** Decimal exato em texto ("0.00123", "-4.5"). Nunca número JSON: perderia precisão. */
export const TextoDecimal = z.string().regex(/^-?\d+(\.\d+)?$/, "decimal em texto, ex.: 0.00123");
export const Fracao = z.number().min(0).max(1);
export const Id = z.string().min(1).max(64);
export const Instante = z.number().int().nonnegative(); // ms desde a época, UTC

export const Lado = z.enum(["COMPRA", "VENDA"]);
export const ModoRobo = z.enum(["observar", "sugerir", "auto"]);
export const Rede = z.enum(["papel", "testnet", "real"]);
export const Intervalo = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
export type ModoRobo = z.infer<typeof ModoRobo>;
export type Rede = z.infer<typeof Rede>;
export type Intervalo = z.infer<typeof Intervalo>;

export const MS_POR_INTERVALO: Record<Intervalo, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
