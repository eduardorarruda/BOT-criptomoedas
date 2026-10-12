import type { Backtest } from "../../api/esquemas";
import { GraficoLinhas } from "../imobiliario/graficos/Linhas";
import type { Serie } from "../imobiliario/graficos/comum";
import { capitalInicial } from "../../lib/metricas";
import { dataDoEixo, pct, pctSinal } from "./formato";
import { quedasComparadas, retornosAcumulados, type SerieComparada } from "./series";

function series(s: SerieComparada): Serie[] {
  return [
    { nome: "Estratégia (simulada)", cor: 3, valores: s.estrategia },
    ...(s.buyHold ? [{ nome: "Buy and hold", cor: 2 as const, valores: s.buyHold }] : []),
  ];
}

/** Retorno acumulado contra o buy and hold e a queda a partir do pico, lado a lado. */
export function GraficosBacktest({ b }: { readonly b: Backtest }) {
  const curva = b.curva ?? [];
  if (!b.metricas || curva.length < 2) return null;
  const capital = Number(capitalInicial(b.metricas, curva) ?? curva[0]?.patrimonio ?? 0);
  const retorno = retornosAcumulados(curva, capital);
  const quedas = quedasComparadas(curva);
  const final = retorno.estrategia.at(-1) ?? 0;
  const bh = retorno.buyHold?.at(-1);
  return (
    <div className="bt-graficos">
      <GraficoLinhas
        titulo="Retorno acumulado (simulado)"
        descricao={`a estratégia terminou em ${pctSinal(final)}${bh === undefined ? "" : ` e o buy and hold em ${pctSinal(bh)}`}, já com custos.`}
        rotulos={retorno.em.map(dataDoEixo)}
        series={series(retorno)}
        formatar={(v) => pctSinal(v)}
        formatarEixo={(v) => pct(v, 0)}
        altura={240}
      />
      <GraficoLinhas
        titulo="Queda a partir do pico"
        descricao={`a pior queda da estratégia foi de ${pct(Math.min(...quedas.estrategia))}${quedas.buyHold ? `; a do buy and hold, ${pct(Math.min(...quedas.buyHold))}` : ""}.`}
        rotulos={quedas.em.map(dataDoEixo)}
        series={series(quedas)}
        formatar={(v) => pct(v)}
        formatarEixo={(v) => pct(v, 0)}
        altura={180}
      />
    </div>
  );
}
