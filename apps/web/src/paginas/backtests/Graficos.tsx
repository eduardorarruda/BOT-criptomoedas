import type { Backtest } from "../../api/esquemas";
import { GraficoLinhas } from "../imobiliario/graficos/Linhas";
import type { Serie } from "../imobiliario/graficos/comum";
import { capitalInicial } from "../../lib/metricas";
import { dataDoEixo, pct, pctSinal } from "./formato";
import { quedasComparadas, retornosAcumulados, type SerieComparada } from "./series";

/** No mini índice, a referência é ficar comprado só durante a sessão (não se dorme posicionado). */
const nomeReferencia = (b: Backtest) => (b.metricas?.win ? "Sempre comprado na sessão" : "Buy and hold");

function series(s: SerieComparada, referencia: string): Serie[] {
  return [
    { nome: "Estratégia (simulada)", cor: 3, valores: s.estrategia },
    ...(s.buyHold ? [{ nome: referencia, cor: 2 as const, valores: s.buyHold }] : []),
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
  const referencia = nomeReferencia(b);
  return (
    <div className="bt-graficos">
      <GraficoLinhas
        titulo="Retorno acumulado (simulado)"
        descricao={`a estratégia terminou em ${pctSinal(final)}${bh === undefined ? "" : ` e ${b.metricas.win ? "sempre comprado na sessão" : "o buy and hold"} em ${pctSinal(bh)}`}, já com custos.`}
        rotulos={retorno.em.map(dataDoEixo)}
        series={series(retorno, referencia)}
        formatar={(v) => pctSinal(v)}
        formatarEixo={(v) => pct(v, 0)}
        altura={240}
      />
      <GraficoLinhas
        titulo="Queda a partir do pico"
        descricao={`a pior queda da estratégia foi de ${pct(Math.min(...quedas.estrategia))}${quedas.buyHold ? `; a ${b.metricas.win ? "de sempre comprado na sessão" : "do buy and hold"}, ${pct(Math.min(...quedas.buyHold))}` : ""}.`}
        rotulos={quedas.em.map(dataDoEixo)}
        series={series(quedas, referencia)}
        formatar={(v) => pct(v)}
        formatarEixo={(v) => pct(v, 0)}
        altura={180}
      />
    </div>
  );
}
