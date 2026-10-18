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
const CURTO = {
  "donchian-20-10": "Donchian",
  "ema-9-21-adx": "EMA 9/21",
  "bollinger-sma200": "Bollinger",
  "macd-momento": "MACD",
  "rsi2-tendencia": "RSI(2)",
};
const limites = {
  perdaDiariaMaxima: "25",
  exposicaoMaxima: "300",
  riscoPorOperacao: "5",
  ordensPorHoraMax: 6,
  pausaAposPerdaMin: 30,
  confiancaMinima: 0.6,
};
const existentes = await (await fetch(`${api}/robos`, { headers: h })).json();
const robos = [];
for (const e of estrategias) {
  const nome = `${CURTO[e.modelo]} · ${PARES[e.modelo].replace("USDT", "")} 5m`;
  let robo = existentes.find((r) => r.nome === nome);
  if (!robo) {
    const corpo = {
      nome,
      simbolo: PARES[e.modelo],
      intervalo: "5m",
      modo: "observar",
      rede: "testnet",
      estrategiaId: e.id,
      estrategiaVersao: e.versao,
      limites,
    };
    const r = await fetch(`${api}/robos`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
    robo = await r.json();
    if (!r.ok) {
      console.log("FALHOU criar", nome, r.status, JSON.stringify(robo).slice(0, 300));
      continue;
    }
  }
  const p = await fetch(`${api}/robos/${robo.id}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({ modo: "auto" }),
  });
  const pj = await p.json();
  if (!p.ok) {
    console.log("FALHOU auto", nome, p.status, JSON.stringify(pj).slice(0, 300));
    continue;
  }
  robos.push({ modelo: e.modelo, id: robo.id, nome, modo: pj.modo, rede: pj.rede });
  console.log(`+ ${nome}: ${pj.modo} na ${pj.rede}`);
}
writeFileSync(new URL("./robos.json", import.meta.url), JSON.stringify(robos, null, 2));
