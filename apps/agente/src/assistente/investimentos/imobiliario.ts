import type { RegistroImobiliario } from "@zentrade/banco";
import type { MetricasImobiliario } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { ErroParametroFinanceiro, metricasEmTexto, visaoEmTexto } from "@zentrade/financas";
import { z } from "zod";
import { definirFerramenta } from "../../ferramentas/index.js";
import {
  cortar,
  fracaoEmPct,
  hojeNoBrasil,
  json,
  limite,
  quando,
  type ContextoInvestimentos,
  type LeituraInvestimentos,
} from "./comum.js";

const SEM_COTACAO =
  "FII e REIT: o assistente não consulta a cotação ao vivo; o valor atual vem do preço informado, da valorização " +
  "informada ou do custo (veja fonteValorAtual). A tela Imobiliário mostra a cotação do dia.";

interface Item {
  readonly registro: RegistroImobiliario;
  readonly metricas: MetricasImobiliario | null;
  readonly erro: string | null;
}

/** Mesmas contas da tela (data-base hoje, sem CDI para comparar e sem cotação); dado que não fecha vira erro. */
function calcular(r: RegistroImobiliario, dataBase: string): Item {
  try {
    const metricas = metricasEmTexto(r.investimento, r.lancamentos, {
      dataBase,
      cdiAnual: null,
      precoCotacao: null,
    });
    return { registro: r, metricas, erro: null };
  } catch (erro) {
    if (!(erro instanceof ErroParametroFinanceiro)) throw erro;
    return { registro: r, metricas: null, erro: erro.message };
  }
}

function linha({ registro: { investimento: i }, metricas: m, erro }: Item, fuso: string) {
  const base = {
    id: i.id,
    nome: i.nome,
    tipo: i.tipo,
    moedaOriginal: i.moeda,
    ...(i.ticker ? { ticker: i.ticker } : {}),
    atualizadoEm: quando(i.atualizadoEm, fuso),
  };
  if (!m) return { ...base, erro };
  return {
    ...base,
    investido: m.investido,
    valorAtual: m.valorAtual,
    fonteValorAtual: m.fonteValorAtual,
    ...(i.valorAtualEm ? { valorAtualEm: i.valorAtualEm } : {}),
    dividaAtual: m.dividaAtual,
    patrimonioLiquido: m.patrimonioLiquido,
    rendaAcumulada: m.rendaAcumulada,
    despesas: m.despesas,
    impostos: m.impostos,
    resgatado: m.resgatado,
    resultadoBruto: m.resultadoBruto,
    resultadoLiquido: m.resultadoLiquido,
    rendaMensalLiquidaMedia: m.rendaMensalLiquidaMedia,
    tirAnualPct: fracaoEmPct(m.tirAnual),
    dividendYieldPct: fracaoEmPct(m.dividendYield),
    encerrado: m.encerrado,
  };
}

/** O que pesa mais primeiro (patrimônio líquido); sem métricas, por último. */
function maiorPrimeiro(a: Item, b: Item): number {
  if (!a.metricas || !b.metricas) return a.metricas ? -1 : b.metricas ? 1 : 0;
  return dec(b.metricas.patrimonioLiquido).comparedTo(a.metricas.patrimonioLiquido);
}

async function lerImobiliario(ctx: ContextoInvestimentos, dados: LeituraInvestimentos, n: number) {
  const dataBase = hojeNoBrasil(ctx.agora());
  const registros = await dados.imobiliario(ctx.usuarioId);
  if (registros.length === 0)
    return {
      moeda: "BRL",
      dataBase,
      investimentos: [],
      aviso: "Nenhum investimento imobiliário cadastrado.",
    };
  const itens = registros.map((r) => calcular(r, dataBase));
  const visao = visaoEmTexto(
    itens.map((i) => ({ tipo: i.registro.investimento.tipo, metricas: i.metricas })),
    { dataBase, cdiAnual: null },
  );
  const comCotas = registros.some((r) => r.investimento.tipo === "fii" || r.investimento.tipo === "reit");
  const { itens: primeiros, omitidos } = cortar([...itens].sort(maiorPrimeiro), n);
  return {
    moeda: "BRL",
    dataBase,
    totais: {
      quantidade: visao.quantidade,
      patrimonio: visao.patrimonio,
      investido: visao.investido,
      rendaMensal: visao.rendaMensal,
      resultadoLiquido: visao.resultadoLiquido,
    },
    investimentos: primeiros.map((item) => linha(item, ctx.fuso)),
    omitidos,
    avisos: comCotas ? [SEM_COTACAO] : [],
  };
}

export const investimentosImobiliarios = (ctx: ContextoInvestimentos, dados: LeituraInvestimentos) =>
  definirFerramenta({
    nome: "investimentos_imobiliarios",
    descricao:
      "Investimentos imobiliários da pessoa (aluguel, temporada, flip, terreno, na planta, FII, REIT, " +
      "crowdfunding, consórcio) com as métricas calculadas na data-base de hoje: investido, valor atual e de onde " +
      "veio (cotacao, manual = informado, valorizacao = estimado pela valorização informada, custo, vendido), " +
      "dívida, patrimônio líquido, renda acumulada, despesas, impostos, resultado bruto e líquido, renda mensal " +
      "média, TIR anual e dividend yield (em %), e quando foi atualizado; mais os totais. Valores em BRL (R$), " +
      "decimais em texto. Os maiores primeiro.",
    entrada: z.object({ limite: limite(15) }),
    rodar: async (e) => json(await lerImobiliario(ctx, dados, e.limite)),
  });
