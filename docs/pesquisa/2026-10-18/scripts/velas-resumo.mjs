import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const lista = JSON.parse(readFileSync(new URL("./velas-maiores.json", import.meta.url), "utf8"));
for (let t = 0; t < 340; t++) {
  const bs = await Promise.all(
    lista.map(async (p) => ({
      p,
      b: await (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${p.id}`, { headers: h })).json(),
    })),
  );
  if (bs.every(({ b }) => b.estado !== "na_fila" && b.estado !== "rodando")) {
    for (const { p, b } of bs) {
      const m = b.metricas;
      if (!m) {
        console.log(p.modelo, p.intervalo, b.estado, b.erro);
        continue;
      }
      const k = 100 / Number(m.saldoInicial);
      console.log(
        [
          p.intervalo,
          p.modelo,
          `ops ${m.operacoes}`,
          `certo ${m.acertos}`,
          `acerto ${(m.taxaAcerto * 100).toFixed(0)}%`,
          `bruto ${(Number(m.resultadoBruto) * k).toFixed(2)}`,
          `taxas ${(-(Number(m.resultadoBruto) - Number(m.resultadoLiquido)) * k).toFixed(2)}`,
          `volta ${(100 + Number(m.resultadoLiquido) * k).toFixed(2)}`,
          `B&H ${(100 + m.buyHoldResultadoPercentual * 100).toFixed(2)}`,
          `OOS fora ${(b.validacao?.amostra?.fora?.retorno * 100).toFixed(2)}%`,
          `WF+ ${(b.validacao?.walkForward?.estabilidade?.fracaoPositivas * 100).toFixed(0)}%`,
        ].join(" | "),
      );
    }
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("tempo esgotado");
