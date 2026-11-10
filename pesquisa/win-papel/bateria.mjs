// Bateria de validação (auditoria de 09/11/2026): V1 custo, V2 Sharpe deflacionado (N = 27),
// V3 walk-forward, V4 platô de parâmetros, V8 CDI e IR, R4 (máquina do tempo por bloco) e
// a mesma P2 em BTC e ETH 1h. Risco = 1% do patrimônio por operação (R5).
// Roda no host, sobre o dist compilado (pnpm build) e os dados que a pasta `--dados` tiver:
//   WIN_M5.csv (exportado do MT5), cdi.json (BCB SGS 12), BTCUSDT-1h.json, ETHUSDT-1h.json
//   e estrategias-db.json (as versões atuais da tabela estrategia_versoes).
//   node pesquisa/win-papel/bateria.mjs --dados <pasta> --saida <arquivo.json>
// Resultado de teste com dados passados, não recomendação de investimento.
import { readFileSync, writeFileSync } from "node:fs";
import { sessoesParaBlocos, poolDeSessoes, simularResto, VALOR_PONTO } from "./maquina-do-tempo.mjs";

const RAIZ = new URL("../../", import.meta.url).pathname;
const de = (p) => import(RAIZ + p);
const { lerCsvCandles } = await de("apps/motor/dist/dados-b3/csv.js");
const { lerFuso, FUSO_B3 } = await de("apps/motor/dist/dados-b3/fuso.js");
const { agregar } = await de("apps/motor/dist/dados-b3/agregar.js");
const { rodarBacktestWin, HISTORICO_WIN } = await de("apps/motor/dist/backtest/win/rodar.js");
const { modeloWinDe } = await de("apps/motor/dist/backtest/win/modelo.js");
const { limitesDoWin } = await de("apps/motor/dist/backtest/win/limites-win.js");
const { metricasDoWin } = await de("apps/motor/dist/backtest/win/metricas.js");
const { janelasWalkForward } = await de("apps/motor/dist/backtest/validacao/walk-forward.js");
const { rodarBacktest } = await de("apps/motor/dist/backtest/rodar.js");
const { ConfiguracaoBacktestEsquema, configuracaoWin, estrategiaDoDTO } = await de("packages/contratos/dist/index.js");
const { dec, contextoDeCandles, decidirComSentido } = await de("packages/dominio/dist/index.js");
const { avaliarTentativas, momentos } = await de("packages/financas/dist/index.js");

const arg = (nome) => process.argv[process.argv.indexOf(nome) + 1];
const DADOS = arg("--dados");
const SAIDA = arg("--saida");
const log = (...x) => console.error(new Date().toISOString().slice(11, 19), ...x);

const SALDO_WIN = 30_000; // 1% = R$ 300 no início (com R$ 10 mil, 1% não paga 1 contrato em 1h)
const RISCO_FRACAO = 0.01;
const SALDO_CRIPTO = 10_000;
const HORA = 3_600_000;
const DIA = 24 * HORA;
const ANO = 365.25 * DIA;
const INICIO = Date.parse("2021-11-22T09:00:00-03:00"); // ~1 mês de aquecimento (SMA 200 em 1h)
const FIM = Date.parse("2026-10-23T00:00:00-03:00");

// ---------- dados ----------
const lido = lerCsvCandles(readFileSync(`${DADOS}/WIN_M5.csv`), {
  intervalo: "5m",
  fuso: lerFuso(FUSO_B3),
  formato: "mt5",
});
const VELAS = { "5m": lido.candles };
VELAS["15m"] = agregar(VELAS["5m"], "5m", "15m");
VELAS["1h"] = agregar(VELAS["5m"], "5m", "1h");
log(`WIN: ${VELAS["5m"].length} velas de 5m, ${VELAS["15m"].length} de 15m, ${VELAS["1h"].length} de 1h`);

const cdiDia = new Map(
  JSON.parse(readFileSync(`${DADOS}/cdi.json`, "utf8")).map((x) => {
    const [d, m, a] = x.data.split("/");
    return [`${a}-${m}-${d}`, Number(x.valor) / 100];
  }),
);

const linhasDb = JSON.parse(readFileSync(`${DADOS}/estrategias-db.json`, "utf8"));
const estrategia = (nome) => {
  const v = linhasDb.find((x) => x.nome === nome);
  if (!v) throw new Error(`estratégia não encontrada: ${nome}`);
  return { nome, regra: { ...v.regra, stop: v.stop, alvoLiquido: v.alvoLiquido, taxa: v.taxa } };
};
/** As 9 do ranking de 5 anos (RESULTADO-5anos.md), versões atuais. */
const NOVE = [
  ["P0 Donchian", "P0 Donchian 20/10 (base)"],
  ["P1 Donchian + tendência", "P1 Donchian 20/10 + tendência longa"],
  ["P1 + filtro de horário", "Mini índice: rompimento a favor da tendência, fora da abertura e do almoço"],
  ["P2 Donchian 55/20", "P2 Donchian 55/20 + tendência longa"],
  ["Donchian com stop ATR", "Mini índice: rompimento de Donchian 20/10 com stop por ATR (v2 21/10)"],
  ["P3 MACD", "P3 MACD (base)"],
  ["EMA 9/21 + ADX", "Mini índice: tendência EMA 9/21 com ADX (v2 21/10)"],
  ["Bollinger volta à média", "Mini índice: volta à média com Bollinger no pregão (v2 21/10)"],
  ["Faixa de abertura", "Mini índice: rompimento da faixa de abertura (30 min) (v2 21/10)"],
].map(([curto, nome]) => ({ curto, ...estrategia(nome) }));
const FOCO = ["P2 Donchian 55/20", "Donchian com stop ATR", "P1 + filtro de horário"];

/** R5: tamanho pela volatilidade ligado em todas (mesmo ATR do stop; senão 20 × 2). */
function comR5(regra) {
  const atr = regra.stopAtr ?? { periodo: 20, multiplo: 2 };
  return estrategiaDoDTO({ ...regra, tamanhoPorVolatilidade: regra.tamanhoPorVolatilidade ?? atr });
}

// ---------- métricas ----------
const diaB3 = (ms) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
const diaUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Retornos diários da curva (último patrimônio de cada dia). */
function retornosDiarios(curva, base, chaveDia) {
  const fim = new Map();
  for (const p of curva) fim.set(chaveDia(p.em), Number(p.patrimonio));
  const dias = [...fim.keys()].sort();
  let anterior = base;
  return dias.map((d) => {
    const r = fim.get(d) / anterior - 1;
    anterior = fim.get(d);
    return { dia: d, r };
  });
}

function sharpeAnual(rs, porAno) {
  const m = momentos(rs);
  return { sharpe: m.desvio > 0 ? (m.media / m.desvio) * Math.sqrt(porAno) : null, ...m };
}

/** Expectativa em R: cada resultado sobre o risco de 1% do patrimônio de antes da entrada. */
function emR(resultados, saldo, riscoFixo) {
  let patrimonio = saldo;
  return resultados.map((x) => {
    const risco = riscoFixo ?? patrimonio * RISCO_FRACAO;
    patrimonio += x;
    return x / risco;
  });
}

function resumoOps(resultados, rs) {
  const ganhos = resultados.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const perdas = -resultados.filter((x) => x < 0).reduce((s, x) => s + x, 0);
  const n = resultados.length;
  return {
    operacoes: n,
    acerto: n ? resultados.filter((x) => x > 0).length / n : null,
    eR: n ? rs.reduce((s, x) => s + x, 0) / n : null,
    fatorLucro: perdas > 0 ? ganhos / perdas : null,
  };
}

const fracao = (q) => (q > 1 ? q / 100 : q); // maiorQuedaPercentual pode vir em % ou fração

// ---------- WIN ----------
function configWin(ticks) {
  const config = ConfiguracaoBacktestEsquema.parse({
    mercado: "win",
    saldoInicial: String(SALDO_WIN),
    execucao: "proximaAbertura",
    win: { riscoPorOperacao: String(SALDO_WIN * RISCO_FRACAO), deslizamentoTicks: ticks, contratosMaximos: 50 },
  });
  const base = modeloWinDe(configuracaoWin(config));
  const modelo = { ...base, riscoFracaoDoCapital: RISCO_FRACAO };
  const { limites } = limitesDoWin(config, dec(SALDO_WIN), base.riscoPorOperacao);
  return { modelo, limites };
}

function rodarWin(regra, intervalo, ticks, inicio = INICIO, fim = FIM, saldo = SALDO_WIN) {
  const { modelo, limites } = configWin(ticks);
  return rodarBacktestWin({
    simbolo: "WIN",
    candles: VELAS[intervalo],
    estrategia: comR5(regra),
    modelo,
    limites,
    saldoInicial: dec(saldo),
    inicio,
    fim,
    execucao: "proximaAbertura",
  });
}

function avaliarWin(r, inicio = INICIO, fim = FIM, saldo = SALDO_WIN) {
  const resultados = r.operacoes.map((o) => Number(o.resultado));
  const ops = resumoOps(resultados, emR(resultados, saldo));
  const diarios = retornosDiarios(r.curva, saldo, diaB3);
  const s = sharpeAnual(
    diarios.map((d) => d.r),
    252,
  );
  const anos = (fim - inicio) / ANO;
  const final = Number(r.patrimonioFinal);
  const cagr = (final / saldo) ** (1 / anos) - 1;
  const dd = fracao(r.maiorQuedaPercentual);
  const m = metricasDoWin(r, {
    simbolo: "WIN",
    saldoInicial: dec(saldo),
    riscoPorOperacao: dec(saldo * RISCO_FRACAO),
    inicio,
    fim,
  });
  const depoisIr = saldo + Number(m.liquidoDepoisDoIr);
  return {
    ...ops,
    liquido: final - saldo,
    irEstimado: Number(m.irEstimado),
    liquidoDepoisDoIr: Number(m.liquidoDepoisDoIr),
    cagr,
    cagrDepoisDoIr: depoisIr > 0 ? (depoisIr / saldo) ** (1 / anos) - 1 : -1,
    maiorQueda: dd,
    calmar: dd > 0 ? cagr / dd : null,
    sharpe: s.sharpe,
    dsrEntrada: {
      sharpeAnual: s.sharpe,
      observacoes: s.n,
      assimetria: s.assimetria,
      curtose: s.curtose,
      barrasPorAno: 252,
      anos,
    },
    semEspaco: r.semEspacoNoRisco,
  };
}

/** CDI composto no período (fração por ano). */
function cdiAnual(inicio, fim) {
  let f = 1;
  let n = 0;
  for (const [d, r] of cdiDia) {
    const t = Date.parse(`${d}T12:00:00-03:00`);
    if (t >= inicio && t < fim) {
      f *= 1 + r;
      n++;
    }
  }
  return { anual: f ** (1 / ((fim - inicio) / ANO)) - 1, dias: n };
}

// ---------- R4: a máquina do tempo como filtro determinístico ----------
function candleDaDecisao(candles, abertaEm) {
  const i = candles.findIndex((c) => c.fechamento + 1 >= abertaEm);
  if (i < 0) return -1;
  return candles[i].abertura === abertaEm ? i - 1 : i;
}

function custoIdaEVoltaPct(modelo, preco) {
  const reais =
    2 * (Number(modelo.custos.tarifaB3) + Number(modelo.custos.corretagem)) +
    2 * modelo.custos.deslizamentoTicks * 5 * VALOR_PONTO;
  return (reais / (preco * VALOR_PONTO)) * 100;
}

/**
 * Para cada operação da regra: o que a máquina do tempo diria no candle da decisão
 * (sorteio dos 100 pregões anteriores, por vela e por bloco). O filtro só deixa entrar
 * com resultado médio simulado > 0. Compara a expectativa em R com e sem o filtro.
 */
function testeR4(regra, intervalo, ticks) {
  const r = rodarWin(regra, intervalo, ticks);
  const e = comR5(regra);
  const { modelo } = configWin(ticks);
  const velas = VELAS[intervalo];
  const v5 = VELAS["5m"];
  const resultados = r.operacoes.map((o) => Number(o.resultado));
  const rs = emR(resultados, SALDO_WIN);
  const linhas = [];
  r.operacoes.forEach((o, k) => {
    const i = candleDaDecisao(velas, o.abertaEm);
    if (i < 0) return;
    const ctx = contextoDeCandles(velas.slice(Math.max(0, i + 1 - HISTORICO_WIN), i + 1));
    const s = decidirComSentido(e, { ...ctx, preco: velas[i].fecha }, null);
    if (!s.stop) return;
    const dia = diaB3(o.abertaEm);
    const ini = Date.parse(`${dia}T09:00:00-03:00`);
    const passado = v5.filter((v) => v.abertura < ini && v.abertura >= ini - 100 * DIA);
    const args = {
      inicioMs: o.abertaEm,
      fimMs: Date.parse(`${dia}T18:15:00-03:00`),
      entrada: Number(o.entrada),
      stop: Number(s.stop),
      alvo: Number(s.alvo ?? (o.sentido === "comprado" ? 1e12 : 0)),
      sentido: o.sentido,
      custoPct: custoIdaEVoltaPct(modelo, Number(o.entrada)),
      replays: 1000,
    };
    const porVela = simularResto({ ...args, pool: poolDeSessoes(passado) });
    const porBloco = simularResto({ ...args, blocos: sessoesParaBlocos(passado) });
    linhas.push({ r: rs[k], porVela: porVela?.resultadoMedio ?? null, porBloco: porBloco?.resultadoMedio ?? null });
  });
  const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const filtro = (campo) => {
    const ok = linhas.filter((l) => l[campo] !== null && l[campo] > 0);
    const fora = linhas.filter((l) => l[campo] !== null && l[campo] <= 0);
    return { entram: ok.length, eREntram: media(ok.map((l) => l.r)), barradas: fora.length, eRBarradas: media(fora.map((l) => l.r)) };
  };
  return { operacoes: linhas.length, eRTodas: media(linhas.map((l) => l.r)), porVela: filtro("porVela"), porBloco: filtro("porBloco") };
}

// ---------- cripto (motor principal, corretora de papel) ----------
function velasCripto(simbolo) {
  return JSON.parse(readFileSync(`${DADOS}/${simbolo}-1h.json`, "utf8")).map(([a, f, o, h, l, c, v]) => ({
    abertura: a,
    fechamento: f,
    abre: dec(o),
    maxima: dec(h),
    minima: dec(l),
    fecha: dec(c),
    volume: dec(v),
  }));
}

async function rodarCripto(simbolo, regra, deslizamentoBps) {
  const candles = velasCripto(simbolo);
  const inicio = candles[0].abertura + 250 * HORA;
  const fim = candles.at(-1).fechamento + 1;
  const risco = SALDO_CRIPTO * RISCO_FRACAO;
  const r = await rodarBacktest({
    simbolo,
    intervalo: "1h",
    candles,
    estrategia: estrategiaDoDTO(regra),
    limites: {
      perdaDiariaMaxima: dec(risco * 3),
      exposicaoMaxima: dec(SALDO_CRIPTO),
      ordensPorHoraMax: 4,
      pausaAposPerdaMs: HORA,
      confiancaMinima: 0,
    },
    riscoPorOperacao: dec(risco),
    saldoInicial: dec(SALDO_CRIPTO),
    agente: "sempre_concorda",
    custos: { taxaPorLado: 0.001, deslizamentoBps, meioSpreadBps: 2 },
    inicio,
    fim,
    execucao: "proximaAbertura",
  });
  const resultados = r.operacoesFechadas.map((o) => Number(o.resultado));
  const ops = resumoOps(resultados, emR(resultados, SALDO_CRIPTO, risco));
  const diarios = retornosDiarios(r.curva, SALDO_CRIPTO, diaUtc);
  const s = sharpeAnual(
    diarios.map((d) => d.r),
    365,
  );
  const excesso = sharpeAnual(
    diarios.map((d) => d.r - (cdiDia.get(d.dia) ?? 0)),
    365,
  );
  const anos = (fim - inicio) / ANO;
  const final = Number(r.patrimonioFinal);
  const cagr = (final / SALDO_CRIPTO) ** (1 / anos) - 1;
  const dd = fracao(r.maiorQuedaPercentual);
  const buyHold = Number(r.buyHold?.resultadoPercentual ?? NaN);
  return {
    ...ops,
    liquido: final - SALDO_CRIPTO,
    cagr,
    maiorQueda: dd,
    calmar: dd > 0 ? cagr / dd : null,
    sharpe: s.sharpe,
    sharpeSobreCdi: excesso.sharpe,
    buyHold,
    erros: r.erros?.length ?? 0,
  };
}

// ---------- a bateria ----------
const saida = { geradoEm: new Date().toISOString(), saldoWin: SALDO_WIN, riscoFracao: RISCO_FRACAO };
const gravar = () => writeFileSync(SAIDA, JSON.stringify(saida, null, 1));

// V1 + V11 + V2: as 27 tentativas (9 estratégias × 3 tempos) com 1, 2 e 3 ticks.
saida.tentativas = {};
for (const ticks of [1, 2, 3]) {
  const linhas = [];
  for (const e of NOVE)
    for (const intervalo of ["5m", "15m", "1h"]) {
      const r = rodarWin(e.regra, intervalo, ticks);
      const a = avaliarWin(r);
      linhas.push({ estrategia: e.curto, intervalo, ...a });
      log(`${ticks} tick(s) ${e.curto} ${intervalo}: ${a.operacoes} ops, E[R] ${a.eR?.toFixed(3)}, PF ${a.fatorLucro?.toFixed(2)}`);
    }
  const sharpes = linhas.map((l) => l.sharpe);
  for (const l of linhas) l.dsr = avaliarTentativas(l.dsrEntrada, sharpes);
  saida.tentativas[ticks] = linhas;
  gravar();
}

// V3: walk-forward da P2 1h (5 janelas rolantes, 70% dentro, parâmetros fixos), 2 e 3 ticks.
const p2 = NOVE.find((e) => e.curto === "P2 Donchian 55/20");
saida.walkForward = {};
for (const ticks of [2, 3]) {
  saida.walkForward[ticks] = janelasWalkForward(INICIO, FIM, { janelas: 5, modo: "rolante", fracaoDentro: 0.7 }).map(
    (j) => {
      const dentro = avaliarWin(rodarWin(p2.regra, "1h", ticks, j.dentro.inicio, j.dentro.fim), j.dentro.inicio, j.dentro.fim);
      const fora = avaliarWin(rodarWin(p2.regra, "1h", ticks, j.fora.inicio, j.fora.fim), j.fora.inicio, j.fora.fim);
      return {
        janela: j.indice + 1,
        fora: { de: diaB3(j.fora.inicio), ate: diaB3(j.fora.fim - 1) },
        dentroCagr: dentro.cagr,
        foraCagr: fora.cagr,
        foraLiquido: fora.liquido,
        foraOperacoes: fora.operacoes,
        foraER: fora.eR,
        eficiencia: dentro.cagr > 0 ? fora.cagr / dentro.cagr : null,
      };
    },
  );
  log(`walk-forward ${ticks} ticks pronto`);
}
gravar();

// V4: platô da P2 1h (2 ticks): Donchian de entrada 44/55/66 × saída 16/20/24 × ATR 1,5/2/2,5.
const trocarPeriodo = (no, lado, novo) =>
  JSON.parse(JSON.stringify(no), (_k, v) =>
    v && v.nome === "donchian" && v.saida === lado ? { ...v, periodo: novo } : v,
  );
saida.plato = [];
for (const ent of [44, 55, 66])
  for (const sai of [16, 20, 24])
    for (const mult of [1.5, 2, 2.5]) {
      const regra = {
        ...p2.regra,
        entrada: trocarPeriodo(p2.regra.entrada, "superior", ent),
        saida: trocarPeriodo(p2.regra.saida, "inferior", sai),
        stopAtr: { periodo: 20, multiplo: mult },
        tamanhoPorVolatilidade: { periodo: 20, multiplo: mult },
      };
      const a = avaliarWin(rodarWin(regra, "1h", 2));
      saida.plato.push({ entrada: ent, saida: sai, atr: mult, operacoes: a.operacoes, eR: a.eR, liquido: a.liquido, fatorLucro: a.fatorLucro, maiorQueda: a.maiorQueda });
    }
log("platô pronto");
gravar();

// V8: CDI do período.
saida.cdi = cdiAnual(INICIO, FIM);

// R4: a máquina do tempo como filtro, por vela e por bloco (2 ticks).
saida.r4 = {};
for (const nome of FOCO)
  for (const intervalo of ["15m", "1h"]) {
    const e = NOVE.find((x) => x.curto === nome);
    saida.r4[`${nome} ${intervalo}`] = testeR4(e.regra, intervalo, 2);
    log(`R4 ${nome} ${intervalo} pronto`);
    gravar();
  }

// Cripto: a mesma P2 (só comprado, à vista) em BTC e ETH 1h, 5 e 10 bps de deslizamento.
saida.cripto = {};
for (const simbolo of ["BTCUSDT", "ETHUSDT"])
  for (const bps of [5, 10]) {
    saida.cripto[`${simbolo} ${bps}bps`] = await rodarCripto(simbolo, p2.regra, bps);
    log(`cripto ${simbolo} ${bps} bps pronto`);
    gravar();
  }

gravar();
log(`gravado em ${SAIDA}`);
