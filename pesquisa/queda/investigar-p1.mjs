// Por que a P1 comprada piorou em 2025–2026? Mercado (retorno, tempo acima da SMA200, volatilidade, tendência)
// e estratégia (duração dos ganhos, rompimentos falsos) ano a ano. Mesmos dados e regras de simular.mjs.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const DIR = new URL("../filtro-ml/dados/4h/", import.meta.url).pathname,
  SLIP = 0.0007,
  TAXA = 0.001;
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
const ano = (t) => new Date(t).getUTCFullYear(),
  ANOS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const m = {},
  e = {};
for (const par of readdirSync(DIR).sort()) {
  const v = ler(par);
  let soma = 0;
  const sma = [];
  for (let i = 0; i < v.length; i++) {
    soma += v[i].c;
    if (i >= 200) soma -= v[i - 200].c;
    sma[i] = i >= 199 ? soma / 200 : null;
  }
  for (const a of ANOS) {
    const d = v.filter((x) => ano(x.t) === a);
    if (d.length < 50) continue;
    const x = (m[a] ??= { ret: [], acima: [], vol: [], eficiencia: [] });
    x.ret.push(d.at(-1).c / d[0].o - 1);
    const idx = v.indexOf(d[0]);
    let ac = 0,
      n = 0;
    for (let i = idx; i < idx + d.length; i++)
      if (sma[i]) {
        n++;
        if (v[i].c > sma[i]) ac++;
      }
    x.acima.push(ac / (n || 1));
    x.vol.push(d.reduce((s, y) => s + (y.h - y.l) / y.c, 0) / d.length);
    // eficiência de tendência (Kaufman): |deslocamento| / soma dos movimentos, em janelas de 30 velas (5 dias)
    let ef = 0,
      k = 0;
    for (let i = 30; i < d.length; i += 30) {
      let tot = 0;
      for (let j = i - 29; j <= i; j++) tot += Math.abs(d[j].c - d[j - 1].c);
      ef += Math.abs(d[i].c - d[i - 30].c) / (tot || 1);
      k++;
    }
    x.eficiencia.push(ef / (k || 1));
  }
  // estratégia P1 (igual a simular.mjs, à vista)
  let pos = null,
    sinal = null;
  const maxH = (i, n) => {
      let r = -Infinity;
      for (let k = i - n; k < i; k++) r = Math.max(r, v[k].h);
      return r;
    },
    minL = (i, n) => {
      let r = Infinity;
      for (let k = i - n; k < i; k++) r = Math.min(r, v[k].l);
      return r;
    };
  const atr = (i) => {
    let s = 0;
    for (let k = i - 19; k <= i; k++)
      s += Math.max(v[k].h - v[k].l, Math.abs(v[k].h - v[k - 1].c), Math.abs(v[k].l - v[k - 1].c));
    return s / 20;
  };
  const fechar = (p, s, t, motivo) => {
    const a = ano(p.t),
      y = (e[a] ??= { ops: [] });
    y.ops.push({ liq: (s - p.e) / p.e - 2 * TAXA, velas: p.velas, motivo, falso: p.velas <= 6 && s < p.e });
  };
  for (let i = 201; i < v.length; i++) {
    const x = v[i];
    if (sinal === "entrar" && !pos) {
      const en = x.o * (1 + SLIP),
        d = Math.min(2 * atr(i - 1), 0.1 * en);
      pos = { e: en, stop: en - d, t: x.t, velas: 0 };
    }
    if (sinal === "sair" && pos) {
      fechar(pos, x.o * (1 - SLIP), x.t, "regra");
      pos = null;
    }
    sinal = null;
    if (pos) {
      pos.velas++;
      if (x.l <= pos.stop) {
        fechar(pos, Math.min(pos.stop, x.o) * (1 - SLIP), x.t, "stop");
        pos = null;
        continue;
      }
    }
    if (!sma[i]) continue;
    if (!pos) {
      if (x.c > maxH(i, 20) && x.c > sma[i]) sinal = "entrar";
    } else if (x.c < minL(i, 10)) sinal = "sair";
  }
}
const med = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1),
  mediana = (a) => {
    const b = [...a].sort((x, y) => x - y);
    return b.length ? b[Math.floor(b.length / 2)] : 0;
  },
  pc = (x) => (100 * x).toFixed(1).padStart(5) + "%";
console.log(
  "ano  | mercado: retorno médio  acima SMA200  oscilação/vela  eficiência | P1: ops  acerto  ganho méd  maiores 10% dos ganhos  duração ganho  rompimento falso  líquido/op",
);
for (const a of ANOS) {
  const x = m[a],
    y = e[a];
  if (!x || !y) continue;
  const o = y.ops,
    g = o
      .filter((z) => z.liq > 0)
      .map((z) => z.liq)
      .sort((p, q) => q - p);
  console.log(
    `${a} | ${pc(med(x.ret))}  ${pc(med(x.acima))}  ${pc(med(x.vol))}  ${med(x.eficiencia).toFixed(3)} | ${String(o.length).padStart(4)}  ${pc(g.length / o.length)}  ${pc(med(g))}  ${pc(med(g.slice(0, Math.max(1, Math.round(g.length / 10)))))}  ${String(mediana(o.filter((z) => z.liq > 0).map((z) => z.velas))).padStart(3)} velas  ${pc(o.filter((z) => z.falso).length / o.length)}  ${pc(med(o.map((z) => z.liq)))}`,
  );
}
