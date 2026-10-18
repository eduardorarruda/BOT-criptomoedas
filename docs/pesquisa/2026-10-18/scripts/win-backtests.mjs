import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const { MODELOS_WIN } =
  await import("/home/eduardoa/Documentos/Projetos/BOT-criptomoedas/packages/dominio/dist/index.js");
const api = "http://127.0.0.1:8095/api/v1";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
  "content-type": "application/json",
};
const dados = await (await fetch(`${api}/backtests/dados-win`, { headers: h })).json();
console.log("dados-win:", JSON.stringify(dados).slice(0, 400));
const existentes = await (await fetch(`${api}/estrategias`, { headers: h })).json();
const pedidos = [];
for (const m of MODELOS_WIN) {
  let e = existentes.find((x) => x.nome === m.nome);
  if (!e) {
    const r = await fetch(`${api}/estrategias`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ nome: m.nome, ...m.estrategia }),
    });
    e = await r.json();
    if (!r.ok) {
      console.log("FALHOU estrategia", m.id, r.status, JSON.stringify(e).slice(0, 300));
      continue;
    }
  }
  for (const intervalo of ["5m", "15m"]) {
    const corpo = {
      estrategiaId: e.id,
      versao: e.versao,
      simbolo: "WIN",
      intervalo,
      inicio: Date.parse("2026-10-13T09:00:00-03:00"),
      fim: Date.parse("2026-10-16T18:30:00-03:00"),
      configuracao: { mercado: "win", saldoInicial: "10000", win: { riscoPorOperacao: "300" } },
    };
    const r = await fetch(`${api}/backtests`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
    const j = await r.json();
    if (!r.ok) {
      console.log("FALHOU backtest", m.id, intervalo, r.status, JSON.stringify(j).slice(0, 300));
      continue;
    }
    pedidos.push({ modelo: m.id, intervalo, id: j.id });
  }
}
writeFileSync(new URL("./win-backtests.json", import.meta.url), JSON.stringify(pedidos, null, 2));
console.log("disparados:", pedidos.length);
