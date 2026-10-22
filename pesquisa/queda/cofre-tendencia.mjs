// "Cofre de tendência" (pré-registrado em 22/10/2026): 4h, SMA 400, UMA decisão por dia (fechamento da vela
// das 00:00 UTC). Acima da SMA 400 -> comprado; abaixo -> caixa. Execução na abertura seguinte; à vista
// (0,1%/lado + 7 pb). Capital todo dentro ou todo fora (juros compostos). Comparado com comprar e segurar
// do mesmo ponto: retorno total e pior queda (do pico ao vale). Carteira: 15 pares com peso igual.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const DIR = new URL("../filtro-ml/dados/4h/", import.meta.url).pathname,
  CUSTO = 0.001 + 0.0007;
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
          return { t, o: +c[1], c: +c[4] };
        }),
    )
    .filter((x) => x.c > 0 && x.o > 0);
function rodar(v) {
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
    trocas = 0,
    velasDentro = 0;
  const curva = [],
    bh = [];
  const i0 = 400;
  for (let i = i0; i < v.length; i++) {
    const x = v[i];
    if (sinal !== null && sinal !== dentro) {
      cap *= 1 - CUSTO;
      dentro = sinal;
      trocas++;
    }
    sinal = null;
    if (dentro) {
      cap *= x.c / (i === i0 ? x.o : v[i - 1].c);
      velasDentro++;
    }
    curva.push({ t: x.t, v: cap });
    bh.push({ t: x.t, v: x.c / v[i0].o });
    if (new Date(x.t).getUTCHours() === 20) sinal = x.c > sma[i];
  } // vela das 20:00 UTC fecha às 00:00 UTC
  return { curva, bh, trocas, investido: velasDentro / (v.length - i0) };
}
const quedaMax = (c) => {
  let pico = 0,
    q = 0;
  for (const p of c) {
    pico = Math.max(pico, p.v);
    q = Math.min(q, p.v / pico - 1);
  }
  return q;
};
const PARES = readdirSync(DIR).sort(),
  pc = (x) => (100 * x).toFixed(0) + "%",
  res = {};
console.log(
  "par   | desde   | cofre: retorno  pior queda | comprar e segurar: retorno  pior queda | trocas  tempo investido",
);
for (const par of PARES) {
  const r = rodar(ler(par));
  res[par] = r;
  console.log(
    `${par.replace("USDT", "").padEnd(5)} | ${new Date(r.curva[0].t).toISOString().slice(0, 7)} | ${pc(r.curva.at(-1).v - 1).padStart(8)}  ${pc(quedaMax(r.curva)).padStart(6)} | ${pc(r.bh.at(-1).v - 1).padStart(8)}  ${pc(quedaMax(r.bh)).padStart(6)} | ${String(r.trocas).padStart(4)}  ${pc(r.investido).padStart(4)}`,
  );
}
// carteira peso igual a partir de 2021-01-01 (todos os pares já têm SMA 400), rebalanceada só no início
const t0 = Date.parse("2021-01-01T00:00:00Z"),
  dias = [
    ...new Set(
      Object.values(res)
        .flatMap((r) => r.curva.map((p) => p.t))
        .filter((t) => t >= t0),
    ),
  ].sort((a, b) => a - b);
const carteira = (chave) => {
  const ult = {},
    base = {};
  return dias.map((t) => {
    let s = 0;
    for (const par of PARES) {
      const p = res[par][chave].find((x) => x.t === t);
      if (p) {
        ult[par] = p.v;
        base[par] ??= p.v;
      }
      s += (ult[par] ?? base[par] ?? 1) / (base[par] ?? 1);
    }
    return { t, v: s / PARES.length };
  });
};
const cc = carteira("curva"),
  cb = carteira("bh");
console.log(
  `\nCARTEIRA (15 pares, peso igual, de 2021-01 a hoje): cofre ${pc(cc.at(-1).v - 1)} com pior queda ${pc(quedaMax(cc))} | comprar e segurar ${pc(cb.at(-1).v - 1)} com pior queda ${pc(quedaMax(cb))}`,
);
for (const a of [2021, 2022, 2023, 2024, 2025, 2026]) {
  const f = (c) => {
    const d = c.filter((p) => new Date(p.t).getUTCFullYear() === a);
    return d.length ? d.at(-1).v / d[0].v - 1 : 0;
  };
  console.log(`  ${a}: cofre ${pc(f(cc)).padStart(6)} | comprar e segurar ${pc(f(cb)).padStart(6)}`);
}
