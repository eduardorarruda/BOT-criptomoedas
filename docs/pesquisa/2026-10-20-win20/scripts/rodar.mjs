import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const { MODELOS_WIN } =
  await import("/home/eduardoa/Documentos/Projetos/BOT-criptomoedas/packages/dominio/dist/index.js");
const api = "http://127.0.0.1:8095/api/v1";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
  "content-type": "application/json",
};
const espera = (ms) => new Promise((s) => setTimeout(s, ms));
const ests = await (await fetch(`${api}/estrategias`, { headers: h })).json();
const alvo = [];
for (const m of MODELOS_WIN) {
  let e = ests.find((x) => x.nome === m.nome);
  if (!e) {
    const r = await fetch(`${api}/estrategias`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ nome: m.nome, ...m.estrategia }),
    });
    e = await r.json();
  }
  alvo.push({ nome: m.id, e });
}
alvo.push({
  nome: "P1-donchian-sma200",
  e: ests.find((x) => x.nome === "P1 Donchian 20/10 + tendência longa"),
});
const inicio = Date.parse("2026-09-21T09:00:00-03:00"),
  fim = Date.parse("2026-10-19T18:30:00-03:00");
const pedidos = [];
for (const { nome, e } of alvo)
  for (const intervalo of ["5m", "15m", "1h"]) {
    const corpo = {
      estrategiaId: e.id,
      versao: e.versao,
      simbolo: "WIN",
      intervalo,
      inicio,
      fim,
      configuracao: {
        mercado: "win",
        saldoInicial: "10000",
        execucao: "proximaAbertura",
        win: { riscoPorOperacao: "300" },
      },
    };
    const r = await fetch(`${api}/backtests`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
    const j = await r.json();
    if (!r.ok) {
      console.log("FALHOU", nome, intervalo, JSON.stringify(j).slice(0, 200));
      continue;
    }
    pedidos.push({ nome, intervalo, id: j.id });
    await espera(300);
  }
writeFileSync("pedidos.json", JSON.stringify(pedidos, null, 1));
console.log("disparados", pedidos.length);
for (;;) {
  let pend = 0;
  for (const p of pedidos) {
    const b = await (await fetch(`${api}/backtests/${p.id}`, { headers: h })).json();
    if (b.estado === "na_fila" || b.estado === "rodando") pend++;
    await espera(200);
  }
  if (!pend) break;
  await espera(15_000);
}
const linhas = [];
for (const p of pedidos) {
  const b = await (await fetch(`${api}/backtests/${p.id}`, { headers: h })).json();
  await espera(200);
  const m = b.metricas,
    w = m?.win;
  if (!m) {
    console.log(p.nome, p.intervalo, b.estado, JSON.stringify(b.erro).slice(0, 150));
    continue;
  }
  const l = {
    nome: p.nome,
    intervalo: p.intervalo,
    ops: m.operacoes,
    certas: m.acertos,
    liq: Number(m.resultadoLiquido),
    bruto: Number(m.resultadoBruto),
    custos: Number(m.resultadoBruto) - Number(m.resultadoLiquido),
    dd: m.maiorQuedaPercentual,
    pf: m.fatorLucro,
    semEspaco: w?.semEspacoNoRisco,
    fora: b.validacao?.amostra?.fora?.retorno,
    refSessao: w?.referencia,
  };
  linhas.push(l);
  console.log(
    `${p.intervalo.padEnd(3)} ${p.nome.padEnd(26)} ops ${String(l.ops).padStart(3)} certas ${String(l.certas).padStart(3)} | líquido R$ ${l.liq.toFixed(2).padStart(9)} | bruto ${l.bruto.toFixed(2).padStart(9)} | custos ${l.custos.toFixed(2).padStart(7)} | PF ${l.pf == null ? "—" : Number(l.pf).toFixed(2)} | queda ${(l.dd * 100).toFixed(1)}% | fora ${l.fora == null ? "—" : (l.fora * 100).toFixed(2) + "%"} | sem espaço ${l.semEspaco}`,
  );
}
writeFileSync("resultado.json", JSON.stringify(linhas, null, 1));
