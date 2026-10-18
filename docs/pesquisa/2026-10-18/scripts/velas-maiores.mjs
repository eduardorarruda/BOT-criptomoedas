import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const api = "http://127.0.0.1:8095/api/v1";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
  "content-type": "application/json",
};
const estrategias = JSON.parse(readFileSync(new URL("./estrategias.json", import.meta.url), "utf8"));
const PARES = {
  "donchian-20-10": "BTCUSDT",
  "ema-9-21-adx": "ETHUSDT",
  "bollinger-sma200": "SOLUSDT",
  "macd-momento": "BNBUSDT",
  "rsi2-tendencia": "BTCUSDT",
};
const fim = Date.now() - 60_000,
  inicio = fim - 730 * 24 * 3600_000;
const pedidos = [];
for (const intervalo of ["1h", "4h", "1d"])
  for (const e of estrategias) {
    const r = await fetch(`${api}/backtests`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        estrategiaId: e.id,
        versao: e.versao,
        simbolo: PARES[e.modelo],
        intervalo,
        inicio,
        fim,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.log("FALHOU", e.modelo, intervalo, JSON.stringify(j).slice(0, 200));
      continue;
    }
    pedidos.push({ modelo: e.modelo, intervalo, id: j.id });
  }
writeFileSync(new URL("./velas-maiores.json", import.meta.url), JSON.stringify(pedidos, null, 2));
console.log("disparados", pedidos.length);
