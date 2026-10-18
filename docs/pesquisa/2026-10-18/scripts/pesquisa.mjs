import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const { MODELOS } =
  await import("/home/eduardoa/Documentos/Projetos/BOT-criptomoedas/packages/dominio/dist/index.js");
const api = "http://127.0.0.1:8095/api/v1";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
  "content-type": "application/json",
};
const preco = { tipo: "preco" };
const ind = (o) => ({ tipo: "indicador", ...o });
const cmp = (esquerda, comparador, direita) => ({ tipo: "comparar", esquerda, comparador, direita });
const tendencia = cmp(preco, ">", ind({ nome: "sma", periodo: 200 }));
const adx20 = cmp(ind({ nome: "adx", periodo: 14, saida: "adx" }), ">", { tipo: "numero", valor: 20 });
const don = MODELOS.find((m) => m.id === "donchian-20-10").estrategia;
const macd = MODELOS.find((m) => m.id === "macd-momento").estrategia;
const VARIANTES = {
  "P0 Donchian 20/10 (base)": don,
  "P1 Donchian 20/10 + tendência longa": { ...don, entrada: { tipo: "e", regras: [don.entrada, tendencia] } },
  "P2 Donchian 55/20 + tendência longa": {
    ...don,
    entrada: {
      tipo: "e",
      regras: [cmp(preco, ">", ind({ nome: "donchian", periodo: 55, saida: "superior" })), tendencia],
    },
    saida: cmp(preco, "<", ind({ nome: "donchian", periodo: 20, saida: "inferior" })),
  },
  "P3 MACD (base)": macd,
  "P4 MACD + tendência longa + ADX": {
    ...macd,
    entrada: { tipo: "e", regras: [...macd.entrada.regras, tendencia, adx20] },
  },
};
const existentes = await (await fetch(`${api}/estrategias`, { headers: h })).json();
const fim = Date.now() - 60_000,
  inicio = fim - 730 * 24 * 3600_000;
const pedidos = [];
for (const [nome, est] of Object.entries(VARIANTES)) {
  let e = existentes.find((x) => x.nome === nome);
  if (!e) {
    const r = await fetch(`${api}/estrategias`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ nome, ...est }),
    });
    e = await r.json();
    if (!r.ok) {
      console.log("FALHOU", nome, JSON.stringify(e).slice(0, 300));
      continue;
    }
  }
  for (const intervalo of ["4h", "1d"])
    for (const simbolo of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]) {
      const r = await fetch(`${api}/backtests`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ estrategiaId: e.id, versao: e.versao, simbolo, intervalo, inicio, fim }),
      });
      const j = await r.json();
      if (!r.ok) {
        console.log("FALHOU bt", nome, simbolo, intervalo, JSON.stringify(j).slice(0, 200));
        continue;
      }
      pedidos.push({ variante: nome, simbolo, intervalo, id: j.id });
    }
}
writeFileSync(new URL("./pesquisa.json", import.meta.url), JSON.stringify(pedidos, null, 2));
console.log("disparados", pedidos.length);
