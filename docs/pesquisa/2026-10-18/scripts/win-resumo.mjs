import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const lista = JSON.parse(readFileSync(new URL("./win-backtests.json", import.meta.url), "utf8"));
for (let t = 0; t < 60; t++) {
  const bs = await Promise.all(
    lista.map(async (p) => ({
      p,
      b: await (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${p.id}`, { headers: h })).json(),
    })),
  );
  if (bs.every(({ b }) => b.estado !== "na_fila" && b.estado !== "rodando")) {
    for (const { p, b } of bs) {
      const m = b.metricas,
        w = m?.win;
      if (!m) {
        console.log(p.modelo, p.intervalo, b.estado, b.erro);
        continue;
      }
      console.log(
        [
          p.modelo,
          p.intervalo,
          `ops ${m.operacoes}`,
          `acerto ${(m.taxaAcerto * 100).toFixed(0)}%`,
          `liq R$ ${Number(m.resultadoLiquido).toFixed(2)}`,
          `bruto R$ ${Number(m.resultadoBruto).toFixed(2)}`,
          `PF ${m.fatorLucro == null ? "—" : Number(m.fatorLucro).toFixed(2)}`,
          `DD ${(m.maiorQuedaPercentual * 100).toFixed(1)}%`,
          `win ${JSON.stringify(w).slice(0, 350)}`,
        ].join(" | "),
      );
    }
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("tempo esgotado");
