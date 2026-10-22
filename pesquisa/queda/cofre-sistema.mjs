// Prova de equivalência do cofre de tendência: o MESMO backtest do sistema (rodarBacktest, com o modelo
// "cofre-tendencia-sma400", execução na abertura seguinte, taxa de 0,1% + 7 pb por lado) contra a conta pura de
// cofre-tendencia.mjs, na mesma janela (do 401º candle de 4h até o último). Lê os CSV de 4h do cache de pesquisa.
//
// Como rodar (a partir da raiz do repositório, com o motor compilado):
//   corepack pnpm turbo run build --filter=@zentrade/motor...
//   COFRE_DADOS=/caminho/para/pesquisa/filtro-ml/dados/4h node pesquisa/queda/cofre-sistema.mjs [BTCUSDT ETHUSDT ...]
// Sem COFRE_DADOS, usa ../filtro-ml/dados/4h (os dados são ignorados pelo git).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { dec } = await import("../../packages/dominio/dist/index.js");
const { MODELOS } = await import("../../packages/dominio/dist/index.js");
const { rodarBacktest } = await import("../../apps/motor/dist/backtest/rodar.js");

const DIR = process.env.COFRE_DADOS ?? new URL("../filtro-ml/dados/4h/", import.meta.url).pathname;
const H4 = 14_400_000;
const CUSTO = 0.001 + 0.0007; // a conta pura de cofre-tendencia.mjs: 0,1% de taxa + 7 pb por troca
const PARES = process.argv.length > 2 ? process.argv.slice(2) : ["BTCUSDT", "ETHUSDT"];

// --- cópia fiel de cofre-tendencia.mjs (leitura, conta pura e pior queda) ---
const ler = (par) =>
  readdirSync(join(DIR, par))
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .flatMap((f) =>
      readFileSync(join(DIR, par, f), "utf8")
        .trim()
        .split("\n")
        .filter((l) => /^\d/.test(l))
        .map((l) => {
          const c = l.split(",");
          let t = +c[0];
          if (t > 1e14) t = Math.floor(t / 1000);
          return { t, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] };
        }),
    )
    .filter((x) => x.c > 0 && x.o > 0);
// `investido` = fração do capital que entra (1 = tudo, como o estudo; 0,995 = com a folga do sistema).
function estudo(v, investido = 1) {
  let soma = 0;
  const sma = [];
  for (let i = 0; i < v.length; i++) {
    soma += v[i].c;
    if (i >= 400) soma -= v[i - 400].c;
    sma[i] = i >= 399 ? soma / 400 : null;
  }
  let cap = 1,
    dentro = false,
    sinal = null,
    trocas = 0;
  const curva = [];
  const i0 = 400;
  for (let i = i0; i < v.length; i++) {
    const x = v[i];
    if (sinal !== null && sinal !== dentro) {
      cap *= 1 - investido * CUSTO;
      dentro = sinal;
      trocas++;
    }
    sinal = null;
    if (dentro) cap *= 1 + investido * (x.c / (i === i0 ? x.o : v[i - 1].c) - 1);
    curva.push(cap);
    if (new Date(x.t).getUTCHours() === 20) sinal = x.c > sma[i];
  }
  return { retorno: cap - 1, queda: quedaMax(curva), trocas };
}
const quedaMax = (c) => {
  let pico = 0,
    q = 0;
  for (const p of c) {
    pico = Math.max(pico, p);
    q = Math.min(q, p / pico - 1);
  }
  return q;
};

// --- o sistema ---
const comoCandle = (x) => ({
  abertura: x.t,
  fechamento: x.t + H4 - 1,
  abre: dec(x.o),
  maxima: dec(x.h),
  minima: dec(x.l),
  fecha: dec(x.c),
  volume: dec(x.v),
});
const SEM_FREIO = {
  perdaDiariaMaxima: dec(1e12),
  exposicaoMaxima: dec(1e12),
  ordensPorHoraMax: 1000,
  pausaAposPerdaMs: 0,
  confiancaMinima: 0,
};
async function sistema(par, v) {
  const modelo = MODELOS.find((m) => m.id === "cofre-tendencia-sma400");
  const r = await rodarBacktest({
    simbolo: par,
    intervalo: "4h",
    candles: v.map(comoCandle),
    // COFRE_ALVO=0.999 afasta o alvo de 99% do modelo (para isolar o efeito dele na comparação).
    estrategia: process.env.COFRE_ALVO
      ? { ...modelo.estrategia, alvoLiquido: Number(process.env.COFRE_ALVO) }
      : modelo.estrategia,
    limites: SEM_FREIO,
    riscoPorOperacao: dec(1),
    saldoInicial: dec(10_000),
    agente: "sempre_concorda",
    custos: { taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
    execucao: "proximaAbertura",
    inicio: v[400].t,
    aquecimento: 400,
  });
  return {
    retorno: r.patrimonioFinal.div(10_000).toNumber() - 1,
    queda: -r.maiorQuedaPercentual,
    trocas: r.ordens,
    stops: r.saidasIntrabar.stop,
    alvos: r.saidasIntrabar.alvo,
    candles: r.candles.length,
  };
}

const pc = (x) => `${(100 * x).toFixed(2)}%`.padStart(10);
console.log(
  "par     | sistema: retorno  pior queda  ordens (stops, alvos) | estudo: retorno  pior queda  trocas | estudo com 99,5% investido: retorno  pior queda",
);
for (const par of PARES) {
  const v = ler(par);
  const e = estudo(v);
  const f = estudo(v, 0.995);
  const s = await sistema(par, v);
  console.log(
    `${par.padEnd(7)} | ${pc(s.retorno)} ${pc(s.queda)} ${String(s.trocas).padStart(5)} (${s.stops}, ${s.alvos})  | ${pc(e.retorno)} ${pc(e.queda)} ${String(e.trocas).padStart(5)} | ${pc(f.retorno)} ${pc(f.queda)}`,
  );
}
