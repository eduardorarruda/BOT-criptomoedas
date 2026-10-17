import { MS_POR_INTERVALO, type Corretora, type Intervalo } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import type { CandleDTO, ConsultaCandles } from "@zentrade/banco";
import { ehSimboloB3 } from "../dados-b3/pregao.js";

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

/** Todos os candles gravados de [inicio, fim), em ordem, paginando de 1000 em 1000. */
export async function candlesDoBanco(banco: CandlesDoBanco, c: ConsultaCandles): Promise<Candle[]> {
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
 * O pregão da B3 tem de 7 a 9 h por dia útil: N candles de aquecimento ocupam cerca de
 * 5 vezes N intervalos em tempo corrido, mais uma semana de folga para feriados. O
 * backtest usa só os N últimos antes do início.
 */
const FATOR_CORRIDO_B3 = 5;
const FOLGA_FERIADOS_MS = 7 * 86_400_000;

/**
 * WIN e WIN-IBOV vêm só do banco (importados por importar-candles-b3 ou
 * importar-candles-csv); a Binance não tem esses símbolos e nunca é chamada. 1m é a
 * precisão de minuto, opcional: sem ela, volta vazio e o backtest segue sem.
 */
async function candlesDaB3(
  fontes: FontesCandles,
  pedido: ConsultaCandles,
  aquecimento: number,
): Promise<Candle[]> {
  if (!fontes.banco)
    throw new Error(`Candles de ${pedido.simbolo} só vêm do banco, e o motor está sem DATABASE_URL.`);
  const ms = MS_POR_INTERVALO[pedido.intervalo];
  const inicio = pedido.inicio - aquecimento * ms * FATOR_CORRIDO_B3 - FOLGA_FERIADOS_MS;
  const lista = await candlesDoBanco(fontes.banco, { ...pedido, inicio });
  const temJanela = lista.some((k) => k.abertura >= pedido.inicio && k.abertura < pedido.fim);
  if (!temJanela && pedido.intervalo !== "1m")
    throw new RangeError(
      `Não há candles de ${pedido.simbolo} em ${pedido.intervalo} no banco para esse período. Importe antes: importar-candles-b3 (Ibovespa, WIN-IBOV) ou importar-candles-csv (WIN); veja docs/dados-b3.md.`,
    );
  return lista;
}

/**
 * Candles fechados de [inicio − aquecimento, fim), em ordem. Primeiro o banco; se ele
 * não cobre a janela, baixa da corretora (dados públicos) e grava no banco para a
 * próxima vez e para o gráfico. Símbolos da B3: só o banco (veja `candlesDaB3`).
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
  if (ehSimboloB3(c.simbolo)) return candlesDaB3(fontes, pedido, aquecimento);
  const salvos = fontes.banco ? await candlesDoBanco(fontes.banco, c) : [];
  if (cobre(salvos, c)) return salvos;
  const baixados = await daCorretora(fontes.corretora, c);
  if (fontes.banco) await gravarEmLotes(fontes.banco, c, baixados);
  return baixados;
}
