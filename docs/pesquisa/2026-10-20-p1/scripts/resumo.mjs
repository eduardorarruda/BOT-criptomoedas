import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const pedidos = JSON.parse(readFileSync("pedidos.json", "utf8"));
const pegar = async (id) =>
  (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${id}`, { headers: h })).json();
for (;;) {
  let prontos = 0;
  for (const p of pedidos) {
    const b = await pegar(p.id);
    if (b.estado !== "na_fila" && b.estado !== "rodando") prontos++;
    await new Promise((s) => setTimeout(s, 200));
  }
  if (prontos === pedidos.length) break;
  await new Promise((s) => setTimeout(s, 20_000));
}
const DIA = 86_400_000,
  curvas = [],
  linhas = [];
for (const p of pedidos) {
  const b = await pegar(p.id);
  await new Promise((s) => setTimeout(s, 200));
  if (b.estado !== "concluido") {
    console.log(p.simbolo, b.estado, JSON.stringify(b.erro).slice(0, 150));
    continue;
  }
  const m = b.metricas,
    s0 = Number(m.saldoInicial),
    v = (x) => (100 * Number(x)) / s0;
  linhas.push({
    par: p.simbolo.replace("USDT", ""),
    ops: m.operacoes,
    acerto: m.taxaAcerto,
    volta: v(m.patrimonioFinal),
    bh: 100 + m.buyHoldResultadoPercentual * 100,
    dd: m.maiorQuedaPercentual,
    fora: b.validacao?.amostra?.fora?.retorno,
    wf: b.validacao?.walkForward?.estabilidade?.fracaoPositivas,
    sharpe: m.sharpe,
    exp: m.tempoExposto,
  });
  const porDia = new Map();
  for (const c of b.curva) porDia.set(Math.floor(c.em / DIA), Number(c.patrimonio) / s0);
  curvas.push(porDia);
}
const dias = [...new Set(curvas.flatMap((c) => [...c.keys()]))].sort((a, b) => a - b);
const ultimo = curvas.map(() => 1),
  cart = [];
for (const d of dias) {
  curvas.forEach((c, i) => {
    if (c.has(d)) ultimo[i] = c.get(d);
  });
  cart.push(ultimo.reduce((a, x) => a + x, 0) / ultimo.length);
}
const ret = cart.slice(1).map((x, i) => x / cart[i] - 1),
  media = ret.reduce((a, x) => a + x, 0) / ret.length,
  dp = Math.sqrt(ret.reduce((a, x) => a + (x - media) ** 2, 0) / (ret.length - 1));
let pico = 0,
  dd = 0;
for (const x of cart) {
  pico = Math.max(pico, x);
  dd = Math.max(dd, 1 - x / pico);
}
const anos = (dias.at(-1) - dias[0]) / 365;
const f = (x, d = 2) => (x == null ? "—" : Number(x).toFixed(d));
for (const l of linhas)
  console.log(
    `${l.par.padEnd(5)} ops ${String(l.ops).padStart(3)} | acerto ${f(l.acerto * 100, 0)}% | volta ${f(l.volta)} | B&H ${f(l.bh, 1)} | DD ${f(l.dd * 100, 1)}% | fora ${f(l.fora * 100)}% | WF+ ${f(l.wf * 100, 0)}% | sharpe ${f(l.sharpe)} | exposto ${f(l.exp * 100, 0)}%`,
  );
const bhMedia = linhas.reduce((a, l) => a + l.bh, 0) / linhas.length;
console.log(
  `\nCARTEIRA (15 contas iguais): volta ${f(cart.at(-1) * 100)} a cada 100 em ${f(anos, 1)} anos | CAGR ${f((cart.at(-1) ** (1 / anos) - 1) * 100)}% | Sharpe ${f((media / dp) * Math.sqrt(365))} | maior queda ${f(dd * 100, 1)}% | B&H médio ${f(bhMedia, 1)} | moedas no lucro ${linhas.filter((l) => l.volta > 100).length}/${linhas.length} | fora da amostra + ${linhas.filter((l) => l.fora > 0).length}/${linhas.length}`,
);
writeFileSync(
  "resultado.json",
  JSON.stringify({ linhas, carteira: { volta: cart.at(-1) * 100, anos, dd } }, null, 1),
);
