import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const token = readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim();
const api = "http://127.0.0.1:8095/api/v1";
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const estrategias = JSON.parse(readFileSync(new URL("./estrategias.json", import.meta.url), "utf8"));
const PARES = {
  "donchian-20-10": "BTCUSDT",
  "ema-9-21-adx": "ETHUSDT",
  "bollinger-sma200": "SOLUSDT",
  "macd-momento": "BNBUSDT",
  "rsi2-tendencia": "BTCUSDT",
};
const fim = Date.now() - 60_000;
const inicio = fim - 180 * 24 * 3600_000;
const pedidos = [];
for (const e of estrategias) {
  const corpo = {
    estrategiaId: e.id,
    versao: e.versao,
    simbolo: PARES[e.modelo],
    intervalo: "5m",
    inicio,
    fim,
  };
  const r = await fetch(`${api}/backtests`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
  const j = await r.json();
  if (!r.ok) {
    console.log("FALHOU", e.modelo, r.status, JSON.stringify(j).slice(0, 300));
    continue;
  }
  pedidos.push({ modelo: e.modelo, simbolo: PARES[e.modelo], id: j.id, estado: j.estado });
  console.log(`+ ${e.modelo} em ${PARES[e.modelo]} 5m (180 dias): ${j.estado}`);
}
writeFileSync(new URL("./backtests-real-5m.json", import.meta.url), JSON.stringify(pedidos, null, 2));
