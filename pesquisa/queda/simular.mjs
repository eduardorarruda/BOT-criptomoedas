// Espelho vendido da P1 (rompimento de baixa em tendência de baixa) vs P1 comprada.
// Pré-registro: Donchian 20/10, SMA 200, stop 2×ATR(20) com teto de 10%, execução na abertura seguinte,
// stop intrabar (pior caso). Custos: à vista 0,1%/lado; futuros 0,05%/lado; +7 pb/lado de deslizamento;
// vendido em futuros paga financiamento de 0,01% a cada 8 h (conservador). US$ 1.000 por operação.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const DIR = new URL("../filtro-ml/dados/4h/", import.meta.url).pathname;
const SLIP = 0.0007,
  FUNDING_POR_VELA = 0.0001 / 2;
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
          return { t, o: +c[1], h: +c[2], l: +c[3], c: +c[4] };
        }),
    );
const sma = (v, i, n) => {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += v[k].c;
  return s / n;
};
const atr = (v, i, n) => {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++)
    s += Math.max(v[k].h - v[k].l, Math.abs(v[k].h - v[k - 1].c), Math.abs(v[k].l - v[k - 1].c));
  return s / n;
};
const maxH = (v, i, n) => {
  let m = -Infinity;
  for (let k = i - n; k < i; k++) m = Math.max(m, v[k].h);
  return m;
};
const minL = (v, i, n) => {
  let m = Infinity;
  for (let k = i - n; k < i; k++) m = Math.min(m, v[k].l);
  return m;
};
function simular(v, lado, taxa, funding) {
  const ops = [];
  let pos = null,
    sinal = null;
  for (let i = 201; i < v.length; i++) {
    const x = v[i];
    if (sinal === "entrar" && !pos) {
      const e = lado === 1 ? x.o * (1 + SLIP) : x.o * (1 - SLIP);
      const a = atr(v, i - 1, 20);
      const d = Math.min(2 * a, 0.1 * e);
      pos = { e, stop: e - lado * d, t: x.t, velas: 0 };
    }
    if (sinal === "sair" && pos) {
      const s = lado === 1 ? x.o * (1 - SLIP) : x.o * (1 + SLIP);
      ops.push(fechar(pos, s, lado, taxa, funding, x.t));
      pos = null;
    }
    sinal = null;
    if (pos) {
      pos.velas++;
      const tocou = lado === 1 ? x.l <= pos.stop : x.h >= pos.stop;
      if (tocou) {
        const s = lado === 1 ? Math.min(pos.stop, x.o) * (1 - SLIP) : Math.max(pos.stop, x.o) * (1 + SLIP);
        ops.push(fechar(pos, s, lado, taxa, funding, x.t));
        pos = null;
        continue;
      }
    }
    const m = sma(v, i, 200);
    if (m === null) continue;
    if (!pos) {
      if (lado === 1 ? x.c > maxH(v, i, 20) && x.c > m : x.c < minL(v, i, 20) && x.c < m) sinal = "entrar";
    } else if (lado === 1 ? x.c < minL(v, i, 10) : x.c > maxH(v, i, 10)) sinal = "sair";
  }
  return ops;
}
function fechar(p, s, lado, taxa, funding, t) {
  const bruto = (lado * (s - p.e)) / p.e;
  const custo = 2 * taxa + (funding && lado === -1 ? FUNDING_POR_VELA * p.velas : 0);
  return { t0: p.t, t, liq: bruto - custo, bruto };
}
const PARES = readdirSync(DIR).sort();
const casos = {
  "P1 comprada (à vista)": [1, 0.001, false],
  "Espelho vendido (futuros)": [-1, 0.0005, true],
  "P1 comprada (futuros)": [1, 0.0005, false],
};
const todos = {};
for (const par of PARES) {
  const v = ler(par);
  for (const [nome, [lado, taxa, f]] of Object.entries(casos))
    (todos[nome] ??= []).push(...simular(v, lado, taxa, f).map((o) => ({ ...o, par })));
}
todos["Compra + venda (futuros)"] = [
  ...todos["P1 comprada (futuros)"],
  ...todos["Espelho vendido (futuros)"],
];
const ano = (t) => new Date(t).getUTCFullYear();
const resumo = (ops) => {
  const g = ops.filter((o) => o.liq > 0);
  const s = ops.reduce((a, o) => a + o.liq, 0) * 1000;
  const mg = g.length ? g.reduce((a, o) => a + o.liq, 0) / g.length : 0,
    pe =
      ops.length - g.length
        ? ops.filter((o) => o.liq <= 0).reduce((a, o) => a + o.liq, 0) / (ops.length - g.length)
        : 0;
  return `${String(ops.length).padStart(4)} ops | acerto ${((100 * g.length) / (ops.length || 1)).toFixed(0).padStart(2)}% | ganho médio ${(100 * mg).toFixed(2)}% | perda média ${(100 * pe).toFixed(2)}% | líquido US$ ${s.toFixed(0).padStart(6)}`;
};
console.log(
  `pares: ${PARES.length} | período: ${new Date(ler(PARES[0])[0].t).toISOString().slice(0, 10)} a hoje`,
);
for (const [nome, ops] of Object.entries(todos)) {
  console.log(`\n== ${nome}\n  total        ${resumo(ops)}`);
  for (const a of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
    const o = ops.filter((x) => ano(x.t0) === a);
    if (o.length) console.log(`  ${a}${a === 2022 ? " (baixa)" : "        "} ${resumo(o)}`);
  }
  const porPar = PARES.map((p) => ops.filter((o) => o.par === p).reduce((a, o) => a + o.liq, 0));
  console.log(`  pares no lucro: ${porPar.filter((x) => x > 0).length}/${PARES.length}`);
}
