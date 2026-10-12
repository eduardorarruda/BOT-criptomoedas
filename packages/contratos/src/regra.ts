import type { Operando, Regra } from "@zentrade/dominio";
import { z } from "zod";

/**
 * Espelho em Zod da árvore de regras do domínio, para validar o que chega da tela e
 * do banco. Aqui só a FORMA; faixas de período, desvios etc. são do validarRegra do
 * domínio, que dá a mensagem para a pessoa.
 */
const Inteiro = z.number().int();

const IndicadorEsquema = z.union([
  z.object({
    tipo: z.literal("indicador"),
    nome: z.enum(["sma", "ema", "rsi", "atr", "roc", "momento", "volumeMedio", "volumeRelativo"]),
    periodo: Inteiro,
  }),
  z.object({
    tipo: z.literal("indicador"),
    nome: z.literal("bollinger"),
    periodo: Inteiro,
    desvios: z.number(),
    saida: z.enum(["media", "superior", "inferior", "percentualB", "largura"]),
  }),
  z.object({
    tipo: z.literal("indicador"),
    nome: z.literal("donchian"),
    periodo: Inteiro,
    saida: z.enum(["superior", "inferior", "meio"]),
  }),
  z.object({
    tipo: z.literal("indicador"),
    nome: z.literal("macd"),
    rapida: Inteiro,
    lenta: Inteiro,
    periodoSinal: Inteiro,
    saida: z.enum(["macd", "sinal", "histograma"]),
  }),
  z.object({
    tipo: z.literal("indicador"),
    nome: z.literal("estocastico"),
    periodo: Inteiro,
    suavizacao: Inteiro,
    saida: z.enum(["k", "d"]),
  }),
  z.object({
    tipo: z.literal("indicador"),
    nome: z.literal("adx"),
    periodo: Inteiro,
    saida: z.enum(["adx", "maisDI", "menosDI"]),
  }),
]);

export const OperandoEsquema: z.ZodType<Operando> = z.lazy(() =>
  z.union([
    z.object({ tipo: z.enum(["preco", "abertura", "maxima", "minima", "volume"]) }),
    z.object({ tipo: z.literal("numero"), valor: z.number() }),
    IndicadorEsquema,
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
