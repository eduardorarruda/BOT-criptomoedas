import type { MoedaCarteira, ParcelaCarteira, ResumoCarteira } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";

/**
 * As colunas da tabela da carteira, de onde cada uma tira o número e como ordenar.
 * Ordenação em decimal exato; o que é desconhecido (null) vai sempre para o fim.
 */
export type Parcela = "total" | "robo" | "manual";

export type Coluna =
  | "ativo"
  | "quantidade"
  | "precoMedio"
  | "custoPosicao"
  | "preco"
  | "valorAtual"
  | "naoRealizado"
  | "realizadoBruto"
  | "realizadoLiquido"
  | "taxas"
  | "retorno"
  | "alocacao"
  | "comprado"
  | "vendido";

export type Formato = "texto" | "quantidade" | "preco" | "dinheiro" | "resultado" | "percentual";

export interface DefinicaoColuna {
  readonly chave: Coluna;
  readonly rotulo: string;
  /** O que o número quer dizer, para o leitor de tela e o title. */
  readonly dica: string;
  readonly formato: Formato;
}

export const COLUNAS: readonly DefinicaoColuna[] = [
  { chave: "ativo", rotulo: "Moeda", dica: "A moeda na sua conta", formato: "texto" },
  {
    chave: "quantidade",
    rotulo: "Quantidade",
    dica: "Quantidade em posição pelas negociações",
    formato: "quantidade",
  },
  {
    chave: "precoMedio",
    rotulo: "Preço médio",
    dica: "Preço médio ponderado de compra, em USDT",
    formato: "preco",
  },
  {
    chave: "custoPosicao",
    rotulo: "Custo",
    dica: "Custo da posição atual (quantidade × preço médio)",
    formato: "dinheiro",
  },
  { chave: "preco", rotulo: "Preço atual", dica: "Último preço na Binance, em USDT", formato: "preco" },
  {
    chave: "valorAtual",
    rotulo: "Valor atual",
    dica: "Quantidade em posição × preço atual",
    formato: "dinheiro",
  },
  {
    chave: "naoRealizado",
    rotulo: "Não realizado",
    dica: "Valor atual − custo da posição",
    formato: "resultado",
  },
  {
    chave: "realizadoBruto",
    rotulo: "Realizado bruto",
    dica: "Ganho ou perda das vendas, sem taxas",
    formato: "resultado",
  },
  {
    chave: "realizadoLiquido",
    rotulo: "Realizado líquido",
    dica: "Realizado bruto − todas as taxas pagas",
    formato: "resultado",
  },
  {
    chave: "taxas",
    rotulo: "Taxas",
    dica: "Taxas pagas, convertidas para USDT no instante",
    formato: "dinheiro",
  },
  { chave: "retorno", rotulo: "Retorno", dica: "Resultado líquido ÷ total comprado", formato: "percentual" },
  { chave: "alocacao", rotulo: "Alocação", dica: "Fatia do valor da conta", formato: "percentual" },
  { chave: "comprado", rotulo: "Comprado", dica: "Total comprado: quantidade e custo", formato: "dinheiro" },
  {
    chave: "vendido",
    rotulo: "Vendido",
    dica: "Total vendido: quantidade e valor recebido",
    formato: "dinheiro",
  },
];

export type Direcao = "asc" | "desc";
export interface Ordem {
  readonly coluna: Coluna;
  readonly direcao: Direcao;
}

export const ORDEM_PADRAO: Ordem = { coluna: "alocacao", direcao: "desc" };

const DA_PARCELA: Partial<Record<Coluna, (p: ParcelaCarteira) => string | null>> = {
  quantidade: (p) => p.quantidade,
  precoMedio: (p) => p.precoMedio,
  custoPosicao: (p) => p.custoPosicao,
  valorAtual: (p) => p.valorAtual,
  naoRealizado: (p) => p.resultadoNaoRealizado,
  realizadoBruto: (p) => p.resultadoRealizadoBruto,
  realizadoLiquido: (p) => p.resultadoRealizadoLiquido,
  taxas: (p) => p.taxas,
  retorno: (p) => p.retorno,
  comprado: (p) => p.custoComprado,
  vendido: (p) => p.valorVendido,
};

/** O número da coluna para a moeda, na parcela escolhida. Moeda de referência (USDT) não tem resultado. */
export function valorDaColuna(m: MoedaCarteira, parcela: Parcela, coluna: Coluna): string | null {
  if (coluna === "ativo") return m.ativo;
  if (coluna === "preco") return m.preco;
  if (coluna === "alocacao") return m.alocacao;
  if (m.referencia) return coluna === "quantidade" ? m.saldo.total : null;
  const ler = DA_PARCELA[coluna];
  return ler ? ler(m[parcela]) : null;
}

function comparar(a: string | null, b: string | null, coluna: Coluna): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return coluna === "ativo" ? a.localeCompare(b) : dec(a).comparedTo(dec(b));
}

export function ordenarMoedas(
  moedas: readonly MoedaCarteira[],
  parcela: Parcela,
  ordem: Ordem,
): MoedaCarteira[] {
  const sinal = ordem.direcao === "asc" ? 1 : -1;
  return [...moedas].sort((x, y) => {
    const a = valorDaColuna(x, parcela, ordem.coluna);
    const b = valorDaColuna(y, parcela, ordem.coluna);
    // Desconhecido vai para o fim nas duas direções.
    if (a === null || b === null) return comparar(a, b, ordem.coluna);
    return sinal * comparar(a, b, ordem.coluna) || x.ativo.localeCompare(y.ativo);
  });
}

/** Mesma coluna inverte; coluna nova começa do maior (a moeda, de A a Z). */
export function alternarOrdem(atual: Ordem, coluna: Coluna): Ordem {
  if (atual.coluna === coluna) return { coluna, direcao: atual.direcao === "asc" ? "desc" : "asc" };
  return { coluna, direcao: coluna === "ativo" ? "asc" : "desc" };
}

/** A linha de totais: soma das moedas na parcela (o resumo da API), na mesma coluna. */
export function totalDaColuna(r: ResumoCarteira, parcela: Parcela, coluna: Coluna): string | null {
  const p = r[parcela];
  const totais: Partial<Record<Coluna, string | null>> = {
    custoPosicao: p.custoPosicao,
    valorAtual: p.valorAtual,
    naoRealizado: p.resultadoNaoRealizado,
    realizadoBruto: p.resultadoRealizadoBruto,
    realizadoLiquido: p.resultadoRealizadoLiquido,
    taxas: p.taxas,
    retorno: p.retorno,
    comprado: p.custoComprado,
  };
  return totais[coluna] ?? null;
}
