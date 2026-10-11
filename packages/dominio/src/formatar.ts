import type { Valor } from "./dinheiro.js";

const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Números das explicações: como uma pessoa escreveria, até 4 casas. */
export const formatarNumero = (n: number | Valor): string =>
  numero.format(typeof n === "number" ? n : n.toNumber());

/** Valores em dólar das mensagens de risco. */
export const formatarDolar = (v: Valor): string => `US$ ${moeda.format(v.toNumber())}`;
