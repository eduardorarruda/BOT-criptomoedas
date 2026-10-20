/**
 * Gera o dataset do meta-rotulamento: sinais da estratégia primária P1 (Donchian 20/10 +
 * preço > SMA 200), rótulo pelo desfecho do placar e features normalizadas.
 * Uso: node pesquisa/filtro-ml/gerar-dataset.ts <intervalo> <saida.csv>
 * Reaproveita o domínio compilado (decidir, simularDesfecho, indicadores); nada olha o futuro:
 * as features usam candles até o fechamento do candle do sinal; a entrada é na abertura do seguinte.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MODELOS,
  atr,
  adx,
  bollinger,
  contextoDeCandles,
  dec,
  decidir,
  donchian,
  ema,
  rsi,
  simularDesfecho,
  sma,
  volumeRelativo,
} from "../../packages/dominio/dist/index.js";
import type { Candle, Estrategia, Regra } from "../../packages/dominio/dist/index.js";
import { AQUECIMENTO, BPS_CONTRA, HORIZONTE_VELAS, PARES, TAXA_POR_LADO } from "./config.ts";

const JANELA = 300;
const MS_HORA = 3_600_000;

/** P1 = o modelo Donchian 20/10 com a regra extra "preço > SMA 200" na entrada. */
function estrategiaP1(): Estrategia {
  const base = MODELOS.find((m) => m.id === "donchian-20-10");
  if (!base) throw new Error("modelo donchian-20-10 não encontrado");
  const extra: Regra = {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: ">",
    direita: { tipo: "indicador", nome: "sma", periodo: 200 },
  };
  return { ...base.estrategia, entrada: { tipo: "e", regras: [base.estrategia.entrada, extra] } };
}

/** Lê os CSVs mensais (tratados como dados não confiáveis: só parse numérico). */
async function lerCandles(par: string, intervalo: string): Promise<Candle[]> {
  const dir = join(import.meta.dirname, "dados", intervalo, par);
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".csv")).sort();
  const vistos = new Set<number>();
  const candles: Candle[] = [];
  for (const arq of arquivos) {
    const texto = await readFile(join(dir, arq), "utf8");
    for (const linha of texto.split("\n")) {
      const c = linha.trim().split(",");
      if (c.length < 7) continue;
      const aberturaBruta = Number(c[0]);
      if (!Number.isFinite(aberturaBruta)) continue;
      // Desde 2025 os arquivos de spot trazem microssegundos.
      const f = aberturaBruta > 1e14 ? 1000 : 1;
      const abertura = Math.floor(aberturaBruta / f);
      if (vistos.has(abertura)) continue;
      vistos.add(abertura);
      candles.push({
        abertura,
        fechamento: Math.floor(Number(c[6]) / f),
        abre: dec(c[1] ?? "NaN"),
        maxima: dec(c[2] ?? "NaN"),
        minima: dec(c[3] ?? "NaN"),
        fecha: dec(c[4] ?? "NaN"),
        volume: dec(c[5] ?? "NaN"),
      });
    }
  }
  candles.sort((a, b) => a.abertura - b.abertura);
  return candles;
}

const FEATURES = [
  "ret_1",
  "ret_3",
  "ret_6",
  "ret_12",
  "ret_24",
  "ret_48",
  "atr_pct",
  "atr_percentil_100",
  "dist_sma200_atr",
  "dist_ema50_atr",
  "inclinacao_sma200",
  "adx_14",
  "rsi_14",
  "bb_largura",
  "volume_rel_20",
  "dist_donchian_atr",
  "btc_ret_6",
  "btc_ret_24",
  "hora_sin",
  "hora_cos",
  "dia_sin",
  "dia_cos",
] as const;

const RETORNOS_LOG = [1, 3, 6, 12, 24, 48] as const;

interface Serie {
  readonly fechamentos: number[];
  readonly maximas: number[];
  readonly minimas: number[];
  readonly volumes: number[];
}

function nulo<T>(v: T | null, nome: string): T {
  if (v === null) throw new Error(`indicador ${nome} sem dados`);
  return v;
}

/** Features normalizadas no fechamento do candle `i` (índice dentro da série `s`, já recortada). */
function features(s: Serie, abertura: number, btcRet: { r6: number; r24: number }): number[] {
  const f = s.fechamentos;
  const n = f.length;
  const fim = f[n - 1] as number;
  const v = { maximas: s.maximas, minimas: s.minimas, fechamentos: f };
  const a = nulo(atr(v, 14), "atr");
  const percentil =
    Array.from({ length: 100 }, (_, d) => atr(v, 14, d))
      .filter((x): x is number => x !== null)
      .filter((x) => x <= a).length / 100;
  const sma200 = nulo(sma(f, 200), "sma200");
  const sma200Antes = nulo(sma(f, 200, 10), "sma200-10");
  const canal = nulo(donchian(v, 20), "donchian");
  const bb = nulo(bollinger(f, 20, 2), "bollinger");
  const data = new Date(abertura);
  const hora = ((data.getUTCHours() + data.getUTCMinutes() / 60) / 24) * 2 * Math.PI;
  const dia = (data.getUTCDay() / 7) * 2 * Math.PI;
  return [
    ...RETORNOS_LOG.map((k) => Math.log(fim / (f[n - 1 - k] as number))),
    a / fim,
    percentil,
    (fim - sma200) / a,
    (fim - nulo(ema(f, 50), "ema50")) / a,
    ((sma200 / sma200Antes - 1) / 10) * 100,
    nulo(adx(v, 14), "adx").adx,
    nulo(rsi(f, 14), "rsi"),
    (bb.superior - bb.inferior) / bb.media,
    nulo(volumeRelativo(s.volumes, 20), "volume"),
    (fim - canal.superior) / a,
    btcRet.r6,
    btcRet.r24,
    Math.sin(hora),
    Math.cos(hora),
    Math.sin(dia),
    Math.cos(dia),
  ];
}

const recorteSerie = (c: readonly number[], de: number, ate: number): number[] => c.slice(de, ate);

async function main() {
  const [intervalo, saida, so] = process.argv.slice(2);
  if (!intervalo || !saida) throw new Error("uso: node gerar-dataset.ts <intervalo> <saida.csv>");
  const horizonte = HORIZONTE_VELAS[intervalo];
  if (!horizonte) throw new Error(`intervalo sem horizonte pré-registrado: ${intervalo}`);
  const intervaloMs = intervalo === "4h" ? 4 * MS_HORA : MS_HORA;
  const estrategia = estrategiaP1();
  const custos = { mercado: "cripto" as const, taxaPorLado: TAXA_POR_LADO, bpsContra: BPS_CONTRA };

  const btc = await lerCandles("BTCUSDT", intervalo);
  const indiceBtc = new Map(btc.map((c, i) => [c.abertura, i]));
  const btcFecha = btc.map((c) => c.fecha.toNumber());
  const btcLog = (abertura: number, k: number): number | null => {
    const i = indiceBtc.get(abertura);
    return i === undefined || i < k ? null : Math.log((btcFecha[i] as number) / (btcFecha[i - k] as number));
  };

  const linhas: string[] = [
    ["par", "sinal_em", "entrada_em", "fim_em", "retorno", "rotulo", "barras", "motivo", ...FEATURES].join(
      ",",
    ),
  ];
  const resumo: string[] = [];
  for (const par of so ? so.split(",") : PARES) {
    const candles = await lerCandles(par, intervalo);
    const lacunas = candles.filter(
      (c, i) => i > 0 && c.abertura - (candles[i - 1] as Candle).abertura !== intervaloMs,
    ).length;
    const ctx = contextoDeCandles(candles);
    let contados = 0;
    let pendentes = 0;
    let semDados = 0;
    let ultimaSaida = -1;
    for (let i = AQUECIMENTO; i < candles.length - 1; i++) {
      if (i <= ultimaSaida) continue;
      const de = Math.max(0, i + 1 - JANELA);
      const vela = candles[i] as Candle;
      const janela = {
        fechamentos: recorteSerie(ctx.fechamentos, de, i + 1),
        aberturas: recorteSerie(ctx.aberturas ?? [], de, i + 1),
        maximas: recorteSerie(ctx.maximas ?? [], de, i + 1),
        minimas: recorteSerie(ctx.minimas ?? [], de, i + 1),
        volumes: recorteSerie(ctx.volumes ?? [], de, i + 1),
        instantes: recorteSerie(ctx.instantes ?? [], de, i + 1),
        ...(ctx.intervaloMs !== undefined ? { intervaloMs: ctx.intervaloMs } : {}),
      };
      const sinal = decidir(
        estrategia,
        { ...janela, preco: vela.fecha },
        { quantidade: dec(0), precoMedio: dec(0), resultadoRealizado: dec(0), taxasPagas: dec(0) },
      );
      if (sinal.acao !== "COMPRAR") continue;
      const seguinte = candles[i + 1] as Candle;
      const depois = candles.slice(i + 1, i + 1 + horizonte);
      const d = simularDesfecho({
        estrategia,
        sentido: "comprado",
        preco: seguinte.abre,
        quantidade: dec(1),
        custos,
        antes: candles.slice(de, i + 1),
        depois,
        horizonte,
      });
      if (d.situacao === "pendente") {
        pendentes++;
        continue;
      }
      const r6 = btcLog(vela.abertura, 6);
      const r24 = btcLog(vela.abertura, 24);
      if (r6 === null || r24 === null) {
        semDados++;
        continue;
      }
      const x = features(janela, vela.abertura, { r6, r24 });
      const retorno = d.retorno;
      linhas.push(
        [
          par,
          vela.fechamento,
          seguinte.abertura,
          d.em,
          retorno,
          retorno > 0 ? 1 : 0,
          d.barras,
          d.motivo,
          ...x,
        ].join(","),
      );
      contados++;
      ultimaSaida = i + d.barras;
    }
    resumo.push(
      `${par}: ${candles.length} velas, ${lacunas} lacunas, ${contados} sinais, ${pendentes} pendentes, ${semDados} sem BTC`,
    );
  }
  await writeFile(saida, linhas.join("\n") + "\n");
  console.warn(resumo.join("\n"));
  console.warn(`total de sinais: ${linhas.length - 1}`);
}

await main();
