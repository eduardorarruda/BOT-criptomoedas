import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const f = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
for (const arq of ["win-backtests.json", "backtests-real-5m.json", "backtests-real-1h.json"])
  for (const p of JSON.parse(readFileSync(arq, "utf8"))) {
    const b = await (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${p.id}`, { headers: h })).json();
    const m = b.metricas,
      k = 100 / Number(m.saldoInicial);
    const ganhos = m.acertos,
      perdas = m.operacoes - m.acertos;
    const ganhou = Number(m.ganhoMedio ?? 0) * ganhos * k,
      perdeu = Number(m.perdaMedia ?? 0) * perdas * k;
    console.log(
      [
        arq.startsWith("win") ? "WIN" : b.simbolo,
        p.modelo,
        b.intervalo,
        `ops ${m.operacoes}`,
        `subiu ${ganhos}`,
        `caiu ${perdas}`,
        `ganhou ${f(ganhou)}`,
        `perdeu ${f(perdeu)}`,
        `bruto ${f(Number(m.resultadoBruto) * k)}`,
        `custos ${f(-(Number(m.resultadoBruto) - Number(m.resultadoLiquido)) * k)}`,
        `liq ${f(Number(m.resultadoLiquido) * k)}`,
        `final ${(100 + Number(m.resultadoLiquido) * k).toFixed(2)}`,
      ].join(" | "),
    );
  }
