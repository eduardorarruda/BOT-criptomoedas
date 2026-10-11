import { TIPOS_IMOBILIARIO, type ItemImobiliario, type TipoImobiliario } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { z } from "zod";
import { campo, contemTexto, lerLista, ordenarPor } from "../../componentes/filtros";

/**
 * Filtros da visão do imobiliário: tipo, moeda, financiamento, situação e texto;
 * ordem e as visões. Os totais e a alocação do recorte usam as mesmas contas da
 * API (só patrimônio positivo entra na alocação).
 */
export const MOEDAS = ["BRL", "USD"] as const;
export const ORDENS = ["valor", "resultado", "tir", "dy", "renda", "nome"] as const;
export const VISOES = ["cartoes", "tabela", "alocacao"] as const;

export const buscaImobiliario = z.object({
  q: campo.busca(),
  tipo: campo.lista(TIPOS_IMOBILIARIO),
  moeda: campo.lista(MOEDAS),
  financiamento: campo.opcao(["com", "sem"] as const),
  situacao: campo.opcao(["ativo", "encerrado"] as const),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  visao: campo.opcao(VISOES),
});
export type BuscaImobiliario = Partial<z.output<typeof buscaImobiliario>>;

export function predicadosImobiliario(b: BuscaImobiliario): Record<string, (i: ItemImobiliario) => boolean> {
  const p: Record<string, (i: ItemImobiliario) => boolean> = {};
  const tipo = lerLista(b.tipo, TIPOS_IMOBILIARIO);
  const moeda = lerLista(b.moeda, MOEDAS);
  if (b.q)
    p.q = (i) => contemTexto(b.q, [i.investimento.nome, i.investimento.ticker, i.investimento.observacoes]);
  if (tipo.length) p.tipo = (i) => tipo.includes(i.investimento.tipo);
  if (moeda.length) p.moeda = (i) => moeda.includes(i.investimento.moeda);
  if (b.financiamento)
    p.financiamento = (i) => (i.investimento.financiamento !== null) === (b.financiamento === "com");
  if (b.situacao) p.situacao = (i) => (i.metricas?.encerrado ?? false) === (b.situacao === "encerrado");
  return p;
}

const numero = (t: string | undefined): number | null => (t === undefined ? null : Number(t));

export function ordenarImobiliario(
  itens: readonly ItemImobiliario[],
  b: BuscaImobiliario,
): ItemImobiliario[] {
  const ordem = b.ordem ?? "valor";
  const dir = b.dir ?? (ordem === "nome" ? "asc" : "desc");
  const chave: Record<(typeof ORDENS)[number], (i: ItemImobiliario) => number | string | null> = {
    valor: (i) => numero(i.metricas?.patrimonioLiquido),
    resultado: (i) => numero(i.metricas?.resultadoLiquido),
    tir: (i) => i.metricas?.tirAnual ?? null,
    dy: (i) => i.metricas?.dividendYield ?? null,
    renda: (i) => numero(i.metricas?.rendaMensalLiquidaMedia),
    nome: (i) => i.investimento.nome,
  };
  return ordenarPor(itens, chave[ordem], dir);
}

export interface TotaisImobiliario {
  readonly patrimonio: string;
  readonly investido: string;
  readonly rendaMensal: string;
  readonly resultadoLiquido: string;
  /** Itens cujos lançamentos não fecham (sem métricas): ficam fora das somas. */
  readonly semMetricas: number;
}

export function totalizarImobiliario(itens: readonly ItemImobiliario[]): TotaisImobiliario {
  const com = itens.flatMap((i) => (i.metricas ? [i.metricas] : []));
  const somar = (ler: (m: (typeof com)[number]) => string) =>
    com.reduce((s, m) => s.plus(ler(m)), dec(0)).toFixed(2);
  return {
    patrimonio: somar((m) => m.patrimonioLiquido),
    investido: somar((m) => m.investido),
    rendaMensal: somar((m) => m.rendaMensalLiquidaMedia),
    resultadoLiquido: somar((m) => m.resultadoLiquido),
    semMetricas: itens.length - com.length,
  };
}

export interface FatiaTipo {
  readonly tipo: TipoImobiliario;
  readonly valor: string;
}

/** Alocação por tipo do recorte: só patrimônio líquido positivo, do maior para o menor. */
export function alocacaoPorTipo(itens: readonly ItemImobiliario[]): FatiaTipo[] {
  const somas = new Map<TipoImobiliario, ReturnType<typeof dec>>();
  for (const i of itens) {
    const v = i.metricas ? dec(i.metricas.patrimonioLiquido) : dec(0);
    if (v.gt(0)) somas.set(i.investimento.tipo, (somas.get(i.investimento.tipo) ?? dec(0)).plus(v));
  }
  return [...somas.entries()]
    .sort((a, b) => b[1].comparedTo(a[1]))
    .map(([tipo, v]) => ({ tipo, valor: v.toFixed(2) }));
}
