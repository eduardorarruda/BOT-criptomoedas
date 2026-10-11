import type { RegistroImobiliario } from "@zentrade/banco";
import { ErroDados } from "@zentrade/banco";
import type { Cotacao, DetalheImobiliario, ItemImobiliario } from "@zentrade/contratos";
import { paraTexto } from "@zentrade/dominio";
import { ErroParametroFinanceiro, metricasEmTexto, tabelaEmTexto } from "@zentrade/financas";
import type { ClienteCotacoesB3 } from "../integracoes/cotacoes-b3.js";
import { ErroApi } from "../erros.js";

/**
 * O que as rotas do imobiliário fazem além de ler e gravar: calcular as métricas com
 * @zentrade/financas, buscar cotações dos FIIs e conferir se os dados fecham.
 */
export interface OpcoesCalculo {
  readonly dataBase: string;
  readonly cdiAnual: number | null;
}

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoje no calendário de Brasília (AAAA-MM-DD). */
export const hojeNoBrasil = (agora: number): string => FORMATO_DIA.format(new Date(agora));

/** Erro de conta (parâmetro que não fecha) vira 400 com a explicação; o resto segue. */
export function traduzir<T>(fn: () => T): T {
  try {
    return fn();
  } catch (erro) {
    if (erro instanceof ErroParametroFinanceiro) throw new ErroApi(400, "dados_invalidos", erro.message);
    throw erro;
  }
}

function metricas(r: RegistroImobiliario, o: OpcoesCalculo, cotacao: Cotacao | null) {
  return metricasEmTexto(r.investimento, r.lancamentos, { ...o, precoCotacao: cotacao?.preco ?? null });
}

/**
 * Conferência dentro da transação: refaz as contas até a data do último lançamento
 * (ou hoje). Venda de cotas que não existem, dólar sem câmbio… viram 400 e nada é gravado.
 */
export function conferidor(agora: number) {
  return (r: RegistroImobiliario): void => {
    const ultima = r.lancamentos.reduce((m, l) => (l.data > m ? l.data : m), hojeNoBrasil(agora));
    try {
      metricas(r, { dataBase: ultima, cdiAnual: null }, null);
    } catch (erro) {
      if (erro instanceof ErroParametroFinanceiro) throw new ErroDados("invalido", erro.message);
      throw erro;
    }
  };
}

export function item(r: RegistroImobiliario, o: OpcoesCalculo, cotacao: Cotacao | null): ItemImobiliario {
  try {
    return { investimento: r.investimento, metricas: metricas(r, o, cotacao), erroMetricas: null };
  } catch (erro) {
    if (!(erro instanceof ErroParametroFinanceiro)) throw erro;
    return { investimento: r.investimento, metricas: null, erroMetricas: erro.message };
  }
}

export function detalhe(
  r: RegistroImobiliario,
  o: OpcoesCalculo,
  cotacao: Cotacao | null,
): DetalheImobiliario {
  const f = r.investimento.financiamento;
  return { ...item(r, o, cotacao), lancamentos: r.lancamentos, tabela: f ? tabelaEmTexto(f) : null, cotacao };
}

/** Cotações dos FIIs da lista (só com cliente configurado). Falha de cotação nunca derruba a tela. */
export async function cotacoesDosFiis(
  cliente: ClienteCotacoesB3 | undefined,
  registros: readonly RegistroImobiliario[],
): Promise<Map<string, Cotacao>> {
  const tickers = registros
    .filter((r) => r.investimento.tipo === "fii" && r.investimento.ticker)
    .map((r) => r.investimento.ticker as string);
  if (!cliente?.configurado || tickers.length === 0) return new Map();
  const { cotacoes } = await cliente.cotar(tickers);
  return new Map(
    cotacoes.map((c) => [
      c.ticker,
      { ticker: c.ticker, preco: paraTexto(c.preco), moeda: c.moeda, em: c.em, fonte: "brapi" as const },
    ]),
  );
}

export const cotacaoDe = (mapa: Map<string, Cotacao>, r: RegistroImobiliario): Cotacao | null =>
  (r.investimento.tipo === "fii" && r.investimento.ticker ? mapa.get(r.investimento.ticker) : undefined) ??
  null;
