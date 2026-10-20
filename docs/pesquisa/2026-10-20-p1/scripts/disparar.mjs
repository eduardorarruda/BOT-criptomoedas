import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const api = "http://127.0.0.1:8095/api/v1";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
  "content-type": "application/json",
};
const pares = JSON.parse(readFileSync("pares.json", "utf8"));
const ests = await (await fetch(`${api}/estrategias`, { headers: h })).json();
const p1 = ests.find((e) => e.nome === "P1 Donchian 20/10 + tendência longa");
if (!p1) {
  console.log("P1 não encontrada");
  process.exit(1);
}
const inicio = Date.parse("2021-01-01T00:00:00Z"),
  fim = Date.parse("2026-10-01T00:00:00Z");
const pedidos = [];
for (const simbolo of pares) {
  const r = await fetch(`${api}/backtests`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      estrategiaId: p1.id,
      versao: p1.versao,
      simbolo,
      intervalo: "4h",
      inicio,
      fim,
      configuracao: { execucao: "proximaAbertura" },
    }),
  });
  const j = await r.json();
  if (!r.ok) {
    console.log("FALHOU", simbolo, JSON.stringify(j).slice(0, 200));
    continue;
  }
  pedidos.push({ simbolo, id: j.id });
  await new Promise((s) => setTimeout(s, 300));
}
writeFileSync("pedidos.json", JSON.stringify(pedidos, null, 1));
console.log("disparados", pedidos.length);
