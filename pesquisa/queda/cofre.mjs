// "Cofre" (pré-registrado em 22/10/2026): 4h, SMA 400. Compra quando fecha X abaixo da SMA 400; vende tudo
// quando fecha X acima. X = 10% (principal) e 0% (comparação). Sem stop. Uma posição por par, execução na
// abertura seguinte, custos de à vista (0,1%/lado + 7 pb). US$ 1.000 por compra. Posição aberta no fim é
// marcada pelo último preço. Comparado com comprar e segurar do primeiro candle com SMA 400 até hoje.
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
          return { t, o: +c[1], c: +c[4], l: +c[3] };
        }),
    );
function cofre(v, folga) {
  let soma = 0;
  const sma = [];
  for (let i = 0; i < v.length; i++) {
    soma += v[i].c;
    if (i >= 400) soma -= v[i - 400].c;
    sma[i] = i >= 399 ? soma / 400 : null;
  }
  const ops = [];
  let pos = null,
    sinal = null,
    piorAberto = 0,
    velasDentro = 0,
    inicio = null;
  for (let i = 400; i < v.length; i++) {
    const x = v[i];
    if (inicio === null) inicio = i;
    if (sinal === "comprar" && !pos) pos = { e: x.o, t: x.t, pior: 0 };
    if (sinal === "vender" && pos) {
      ops.push({ t0: pos.t, t: x.t, liq: x.o / pos.e - 1 - 2 * CUSTO, pior: pos.pior });
      pos = null;
    }
    sinal = null;
    if (pos) {
      velasDentro++;
      pos.pior = Math.min(pos.pior, x.l / pos.e - 1);
      piorAberto = Math.min(piorAberto, pos.pior);
    }
    if (!pos && x.c < sma[i] * (1 - folga)) sinal = "comprar";
    else if (pos && x.c > sma[i] * (1 + folga)) sinal = "vender";
  }
  const aberto = pos ? { liq: v.at(-1).c / pos.e - 1 - CUSTO, t0: pos.t, pior: pos.pior } : null;
  return {
    ops,
    aberto,
    piorAberto,
    investido: velasDentro / (v.length - inicio),
    bh: v.at(-1).c / v[inicio].o - 1,
    desde: v[inicio].t,
  };
}
const PARES = readdirSync(DIR).sort(),
  pc = (x) => (100 * x).toFixed(0) + "%";
for (const folga of [0.1, 0]) {
  console.log(
    `\n== cofre com folga de ${folga * 100}% (compra ${folga * 100}% abaixo da SMA 400, vende ${folga * 100}% acima)`,
  );
  let tot = 0,
    totBH = 0;
  const linhas = [];
  for (const par of PARES) {
    const r = cofre(ler(par), folga);
    const fech = r.ops.reduce((a, o) => a + o.liq, 0);
    const total = fech + (r.aberto?.liq ?? 0);
    tot += total * 1000;
    totBH += r.bh * 1000;
    linhas.push(
      `  ${par.replace("USDT", "").padEnd(5)} desde ${new Date(r.desde).toISOString().slice(0, 7)} | ciclos ${String(r.ops.length).padStart(2)} (ganhos ${r.ops.filter((o) => o.liq > 0).length}) | resultado ${pc(total).padStart(6)} ${r.aberto ? `(com ${pc(r.aberto.liq)} em aberto)` : "".padEnd(19)} | pior queda segurando ${pc(r.piorAberto).padStart(5)} | tempo investido ${pc(r.investido).padStart(4)} | comprar e segurar ${pc(r.bh).padStart(7)}`,
    );
  }
  console.log(linhas.join("\n"));
  console.log(
    `  TOTAL (US$ 1.000 por par): cofre US$ ${tot.toFixed(0)} | comprar e segurar US$ ${totBH.toFixed(0)}`,
  );
}
