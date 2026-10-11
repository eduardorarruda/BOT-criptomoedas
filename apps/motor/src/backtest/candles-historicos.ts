import { MS_POR_INTERVALO, type Corretora, type Intervalo } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import type { CandleDTO, ConsultaCandles } from "@zentrade/banco";

/** O pedaço do repositório de mercado (packages/banco) que o backtest usa. */
export interface CandlesDoBanco {
  candles(c: ConsultaCandles): Promise<CandleDTO[]>;
  gravar(simbolo: string, intervalo: Intervalo, lista: readonly Candle[]): Promise<void>;
}

export interface FontesCandles {
  readonly banco?: CandlesDoBanco;
  /** Dados públicos de mercado (sem chave). */
  readonly corretora: Pick<Corretora, "candles">;
}

const POR_PAGINA = 1000;
/** ~5 meses de 1 min ou 22 anos de 1 h: mais que isso é engano, não backtest. */
const MAXIMO_CANDLES = 220_000;

const doDTO = (k: CandleDTO, ms: number): Candle => ({
  abertura: k.abertura,
  fechamento: k.abertura + ms - 1,
  abre: dec(k.abre),
  maxima: dec(k.maxima),
  minima: dec(k.minima),
  fecha: dec(k.fecha),
  volume: dec(k.volume),
});

async function doBanco(banco: CandlesDoBanco, c: ConsultaCandles): Promise<Candle[]> {
  const ms = MS_POR_INTERVALO[c.intervalo];
  let lista: Candle[] = [];
  for (let cursor = c.inicio; cursor < c.fim;) {
    const pagina = await banco.candles({ ...c, inicio: cursor });
    lista = [...lista, ...pagina.map((k) => doDTO(k, ms))];
    if (pagina.length < POR_PAGINA) break;
    cursor = (pagina.at(-1)?.abertura ?? c.fim) + 1;
  }
  return lista;
}

/** Da corretora, de trás para frente (a API devolve os N mais recentes antes de `fim`). */
async function daCorretora(corretora: FontesCandles["corretora"], c: ConsultaCandles): Promise<Candle[]> {
  let lista: Candle[] = [];
  for (let fim = c.fim; fim > c.inicio;) {
    const pagina = await corretora.candles(c.simbolo, c.intervalo, POR_PAGINA, fim);
    const primeiro = pagina[0];
    if (!primeiro || primeiro.abertura >= fim) break;
    lista = [...pagina.filter((k) => k.abertura >= c.inicio), ...lista];
    fim = primeiro.abertura;
  }
  return lista;
}

/** O banco cobre a janela quando tem (quase) todos os candles, das pontas inclusive. */
function cobre(lista: readonly Candle[], c: ConsultaCandles): boolean {
  const ms = MS_POR_INTERVALO[c.intervalo];
  const esperado = Math.floor((c.fim - c.inicio) / ms);
  const primeiro = lista[0];
  const ultimo = lista.at(-1);
  if (!primeiro || !ultimo) return false;
  return (
    primeiro.abertura < c.inicio + ms && ultimo.abertura >= c.fim - 2 * ms && lista.length >= esperado * 0.95
  );
}

async function gravarEmLotes(
  banco: CandlesDoBanco,
  c: ConsultaCandles,
  lista: readonly Candle[],
): Promise<void> {
  for (let i = 0; i < lista.length; i += POR_PAGINA)
    await banco.gravar(c.simbolo, c.intervalo, lista.slice(i, i + POR_PAGINA));
}

/**
 * Candles fechados de [inicio − aquecimento, fim), em ordem. Primeiro o banco; se ele
 * não cobre a janela, baixa da corretora (dados públicos) e grava no banco para a
 * próxima vez e para o gráfico.
 */
export async function candlesHistoricos(
  fontes: FontesCandles,
  pedido: ConsultaCandles,
  aquecimento: number,
): Promise<Candle[]> {
  const ms = MS_POR_INTERVALO[pedido.intervalo];
  const c: ConsultaCandles = { ...pedido, inicio: pedido.inicio - aquecimento * ms };
  if ((c.fim - c.inicio) / ms > MAXIMO_CANDLES)
    throw new RangeError(
      `Período longo demais para o backtest (${Math.ceil((c.fim - c.inicio) / ms)} candles de ${c.intervalo}; o máximo é ${MAXIMO_CANDLES}). Encurte o período ou use um intervalo maior.`,
    );
  const salvos = fontes.banco ? await doBanco(fontes.banco, c) : [];
  if (cobre(salvos, c)) return salvos;
  const baixados = await daCorretora(fontes.corretora, c);
  if (fontes.banco) await gravarEmLotes(fontes.banco, c, baixados);
  return baixados;
}
