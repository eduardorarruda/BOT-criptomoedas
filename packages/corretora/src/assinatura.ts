import { createHmac } from "node:crypto";

/** Assinatura das rotas privadas da Binance: HMAC-SHA256 da consulta, em hexadecimal. */
export const assinarConsulta = (consulta: string, segredo: string): string =>
  createHmac("sha256", segredo).update(consulta).digest("hex");
