import type { Operando, Regra } from "@zentrade/dominio";
import { z } from "zod";

/** Espelho em Zod da árvore de regras do domínio, para validar o que chega da tela e do banco. */
export const OperandoEsquema: z.ZodType<Operando> = z.lazy(() =>
  z.union([
    z.object({ tipo: z.literal("preco") }),
    z.object({ tipo: z.literal("numero"), valor: z.number() }),
    z.object({
      tipo: z.literal("indicador"),
      nome: z.enum(["sma", "ema", "rsi"]),
      periodo: z.number().int(),
    }),
    z.object({ tipo: z.literal("multiplicar"), operando: OperandoEsquema, fator: z.number() }),
  ]),
);

export const RegraEsquema: z.ZodType<Regra> = z.lazy(() =>
  z.union([
    z.object({ tipo: z.literal("e"), regras: z.array(RegraEsquema) }),
    z.object({ tipo: z.literal("ou"), regras: z.array(RegraEsquema) }),
    z.object({ tipo: z.literal("nao"), regra: RegraEsquema }),
    z.object({
      tipo: z.literal("comparar"),
      esquerda: OperandoEsquema,
      comparador: z.enum(["<", "<=", ">", ">=", "cruzouAcima", "cruzouAbaixo"]),
      direita: OperandoEsquema,
    }),
  ]),
);
