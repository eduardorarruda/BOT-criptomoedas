import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const p = (x) => (x == null ? "—" : `${(x * 100).toFixed(2)}%`);
for (const arq of ["backtests-real-5m.json", "backtests-real-1h.json"]) {
  for (const b0 of JSON.parse(readFileSync(arq, "utf8"))) {
    const b = await (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${b0.id}`, { headers: h })).json();
    const v = b.validacao,
      t = b.tentativas,
      m = b.metricas;
    console.log(
      [
        b.intervalo,
        b0.modelo,
        `taxas ${Number(m.taxasPagas).toFixed(0)}`,
        `OOS in ${p(v.amostra.dentro.retorno)} out ${p(v.amostra.fora.retorno)} (${v.amostra.fora.operacoes} ops)`,
        `WF+ ${p(v.walkForward.estabilidade.fracaoPositivas)}`,
        `MC p5/p50 ${p(v.monteCarlo?.retornoFinal?.p5)}/${p(v.monteCarlo?.retornoFinal?.p50)}`,
        `sharpe ${Number(m.sharpe).toFixed(2)}`,
        `tent ${JSON.stringify(t).slice(0, 160)}`,
      ].join(" | "),
    );
  }
}
