import { ema, paraTexto, rsi, sma } from "@zentrade/dominio";
import { z } from "zod";
import { definirFerramenta } from "./definicao.js";
import { json, type ContextoAnalise } from "./contexto.js";

const periodo = (padrao: number) => z.number().int().min(2).max(500).default(padrao);

const Entrada = z.object({
  periodoSma: periodo(20).describe("Período da média móvel simples (padrão 20)"),
  periodoEma: periodo(9).describe("Período da média móvel exponencial (padrão 9)"),
  periodoRsi: periodo(14).describe("Período do RSI (padrão 14)"),
  janelaVariacao: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(24)
    .describe("Quantos candles para trás medir a variação"),
});

function variacao(fechamentos: readonly number[], janela: number): number | null {
  const atual = fechamentos.at(-1);
  const antes = fechamentos[fechamentos.length - 1 - janela];
  if (atual === undefined || antes === undefined || antes === 0) return null;
  return ((atual - antes) / antes) * 100;
}

export function retratoMercado(ctx: ContextoAnalise) {
  return definirFerramenta({
    nome: "retrato_mercado",
    descricao:
      "Preço atual, últimos fechamentos e indicadores (SMA, EMA, RSI) calculados pelo domínio do ZenTrade " +
      "sobre os fechamentos do pedido, mais a variação percentual numa janela de candles.",
    entrada: Entrada,
    rodar: (e) => {
      const f = ctx.pedido.fechamentos;
      return json({
        simbolo: ctx.pedido.robo.simbolo,
        intervalo: ctx.pedido.robo.intervalo,
        preco: paraTexto(ctx.pedido.preco),
        quantidadeFechamentos: f.length,
        ultimosFechamentos: f.slice(-10),
        sma: { periodo: e.periodoSma, valor: sma(f, e.periodoSma) },
        ema: { periodo: e.periodoEma, valor: ema(f, e.periodoEma) },
        rsi: { periodo: e.periodoRsi, valor: rsi(f, e.periodoRsi) },
        variacaoPercentual: { janela: e.janelaVariacao, valor: variacao(f, e.janelaVariacao) },
      });
    },
  });
}
