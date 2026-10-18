import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const lista = JSON.parse(readFileSync(new URL("./pesquisa.json", import.meta.url), "utf8"));
for (let t = 0; t < 360; t++) {
  const bs = await Promise.all(
    lista.map(async (p) => ({
      p,
      b: await (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${p.id}`, { headers: h })).json(),
    })),
  );
  if (bs.every(({ b }) => b.estado !== "na_fila" && b.estado !== "rodando")) {
    const agrup = {};
    for (const { p, b } of bs) {
      const m = b.metricas;
      if (!m) {
        console.log("ERRO", p.variante, p.simbolo, p.intervalo, b.erro);
        continue;
      }
      const k = 100 / Number(m.saldoInicial),
        volta = 100 + Number(m.resultadoLiquido) * k;
      const fora = b.validacao?.amostra?.fora?.retorno ?? 0;
      console.log(
        [
          p.intervalo,
          p.variante.slice(0, 2),
          p.simbolo.replace("USDT", ""),
          `ops ${m.operacoes}`,
          `acerto ${(m.taxaAcerto * 100).toFixed(0)}%`,
          `volta ${volta.toFixed(2)}`,
          `DD ${(m.maiorQuedaPercentual * 100).toFixed(1)}%`,
          `fora ${(fora * 100).toFixed(2)}%`,
          `WF+ ${((b.validacao?.walkForward?.estabilidade?.fracaoPositivas ?? 0) * 100).toFixed(0)}%`,
          `B&H ${(100 + m.buyHoldResultadoPercentual * 100).toFixed(1)}`,
        ].join(" | "),
      );
      const a = (agrup[`${p.intervalo} ${p.variante}`] ??= {
        n: 0,
        soma: 0,
        pos: 0,
        fora: 0,
        ops: 0,
        acertos: 0,
      });
      a.n++;
      a.soma += volta - 100;
      a.pos += volta > 100 ? 1 : 0;
      a.fora += fora > 0 ? 1 : 0;
      a.ops += m.operacoes;
      a.acertos += m.acertos;
    }
    console.log("\n== média por variante (4 moedas)");
    for (const [k, a] of Object.entries(agrup))
      console.log(
        `${k} | média ${(100 + a.soma / a.n).toFixed(2)} | lucrou em ${a.pos}/${a.n} | fora da amostra positivo ${a.fora}/${a.n} | ops ${a.ops} | acerto ${((a.acertos / a.ops) * 100).toFixed(0)}%`,
      );
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("tempo esgotado");
