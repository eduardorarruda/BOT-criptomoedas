import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const h = {
  authorization: `Bearer ${readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim()}`,
};
const GRUPOS = {
  "cripto-180d-5m": "backtests-real-5m.json",
  "cripto-180d-1h": "backtests-real-1h.json",
  "cripto-2anos-1h-4h-1d": "velas-maiores.json",
  "win-4dias-risco300": "win-backtests.json",
  "pesquisa-variantes-2anos": "pesquisa.json",
};
const saida = { geradoEm: new Date().toISOString(), grupos: {} };
let pend = 0;
for (const [g, arq] of Object.entries(GRUPOS)) {
  saida.grupos[g] = [];
  for (const p of JSON.parse(readFileSync(arq, "utf8"))) {
    const b = await (await fetch(`http://127.0.0.1:8095/api/v1/backtests/${p.id}`, { headers: h })).json();
    if (b.estado !== "concluido") pend++;
    const m = b.metricas;
    saida.grupos[g].push({
      ...p,
      simbolo: b.simbolo,
      intervalo: b.intervalo,
      inicio: b.inicio,
      fim: b.fim,
      estado: b.estado,
      metricas: m,
      validacao: b.validacao
        ? {
            amostra: b.validacao.amostra,
            walkForward: { ...b.validacao.walkForward, janelas: undefined },
            monteCarlo: b.validacao.monteCarlo && { ...b.validacao.monteCarlo, histograma: undefined },
            avisos: b.validacao.avisos,
          }
        : null,
      tentativas: b.tentativas,
      configuracao: b.configuracao,
    });
  }
}
writeFileSync("metricas-completas.json", JSON.stringify(saida, null, 1));
console.log("pendentes:", pend);
const d = await (await fetch("http://127.0.0.1:8095/api/v1/decisoes?limite=200", { headers: h })).json();
const ds = d.itens ?? d.dados ?? d;
writeFileSync(
  "decisoes-claude.json",
  JSON.stringify(
    ds.map((x) => ({
      em: x.em,
      roboId: x.roboId,
      sinal: x.sinal,
      proposta: x.proposta,
      estado: x.estado,
      preco: x.preco,
      custoIaUsd: x.custoIaUsd,
      avaliacao: x.avaliacao,
    })),
    null,
    1,
  ),
);
const pl = await (await fetch("http://127.0.0.1:8095/api/v1/decisoes/placar", { headers: h })).json();
writeFileSync("placar-claude.json", JSON.stringify(pl, null, 1));
console.log("decisões:", ds.length, "| placar:", JSON.stringify(pl).slice(0, 300));
