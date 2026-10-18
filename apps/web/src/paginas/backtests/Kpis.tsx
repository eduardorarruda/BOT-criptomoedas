import type { Backtest } from "../../api/esquemas";
import { Dinheiro } from "../../componentes/Dinheiro";
import { CartaoKpi, GradeKpi, type TomKpi } from "../../componentes/Kpi";
import { formatarDinheiro } from "../../lib/formatar";
import { capitalInicial, fracaoSobre } from "../../lib/metricas";
import { duracao, pct, pctSinal, razao } from "./formato";
import { KpisWin } from "./ResultadoWin";

type Metricas = NonNullable<Backtest["metricas"]>;

const tomDo = (v: number | null | undefined): TomKpi =>
  v === null || v === undefined || v === 0 ? "neutro" : v > 0 ? "ganho" : "perda";

/** Os indicadores que existem desde a primeira versão (backtests antigos também têm). */
function Basicos({ m, capital }: { readonly m: Metricas; readonly capital: string | null }) {
  const sobre = capital ? Number(fracaoSobre(m.resultadoLiquido, capital)) : null;
  return (
    <>
      <CartaoKpi
        destaque
        rotulo="Resultado líquido"
        valor={<Dinheiro valor={m.resultadoLiquido} sinal colorir />}
        variacao={sobre === null ? undefined : `${pctSinal(sobre)} sobre ${formatarDinheiro(capital ?? "0")}`}
        tomVariacao={tomDo(sobre)}
        nota={
          m.resultadoBruto === undefined
            ? "Com as taxas descontadas."
            : `Antes dos custos: ${formatarDinheiro(m.resultadoBruto, { sinal: true })}.`
        }
      />
      <CartaoKpi
        rotulo="Maior queda"
        valor={<Dinheiro valor={`-${m.maiorQueda}`} colorir />}
        variacao={`${pct(m.maiorQuedaPercentual)} do pico`}
        tomVariacao="perda"
        nota={
          m.duracaoMaiorQuedaMs === undefined
            ? undefined
            : `${duracao(m.duracaoMaiorQuedaMs)} ${m.maiorQuedaRecuperada ? "até recuperar" : "e ainda não recuperou"}.`
        }
      />
      <CartaoKpi
        rotulo="Operações"
        valor={<span className="num">{m.operacoes}</span>}
        nota={`${pct(m.taxaAcerto, 0)} terminaram no lucro.`}
      />
      <CartaoKpi
        rotulo="Custos simulados"
        valor={<span className="num perda">{formatarDinheiro(m.taxasPagas)}</span>}
        nota={
          m.deslizamentoPago === undefined
            ? "Só taxas (backtest antigo, sem deslizamento)."
            : `Em taxas, mais ${formatarDinheiro(m.deslizamentoPago)} de deslizamento e spread.`
        }
      />
    </>
  );
}

function Avancados({ m }: { readonly m: Metricas }) {
  if (m.sharpe === undefined) return null;
  return (
    <>
      <CartaoKpi
        rotulo="Buy and hold"
        valor={<span className="num">{pctSinal(m.buyHoldResultadoPercentual)}</span>}
        variacao={`diferença: ${pctSinal(m.excessoSobreBuyHold)}`}
        tomVariacao={tomDo(m.excessoSobreBuyHold)}
        nota="Comprar no início e segurar, com os mesmos custos. Diferença = estratégia − buy and hold."
      />
      <CartaoKpi
        rotulo="Sharpe · Sortino"
        valor={
          <span className="num">
            {razao(m.sharpe)} · {razao(m.sortino)}
          </span>
        }
        nota={`Anualizados (365 dias). Buy and hold: Sharpe ${razao(m.buyHoldSharpe)}.`}
      />
      <CartaoKpi
        rotulo="Volatilidade anual"
        valor={<span className="num">{pct(m.volatilidadeAnual)}</span>}
        nota={
          m.cagr === null
            ? "CAGR e Calmar pedem 1 ano ou mais."
            : `CAGR ${pctSinal(m.cagr)} · Calmar ${razao(m.calmar)}.`
        }
      />
      <CartaoKpi
        rotulo="Fator de lucro"
        valor={<span className="num">{razao(m.fatorLucro)}</span>}
        nota={`Payoff ${razao(m.payoff)} · ganho médio ${formatarDinheiro(m.ganhoMedio ?? "0")} · perda média ${formatarDinheiro(m.perdaMedia ?? "0")}.`}
      />
      <CartaoKpi
        rotulo="Expectativa por operação"
        valor={<Dinheiro valor={m.expectativa ?? "0"} sinal colorir />}
        nota={`Com posição aberta em ${pct(m.tempoExposto, 0)} do tempo.`}
      />
    </>
  );
}

export function KpisBacktest({ b }: { readonly b: Backtest }) {
  const m = b.metricas;
  if (!m) return null;
  if (m.win) return <KpisWin m={m} w={m.win} />;
  return (
    <GradeKpi rotulo="Indicadores do backtest" className="bt-kpis">
      <Basicos m={m} capital={capitalInicial(m, b.curva)} />
      <Avancados m={m} />
    </GradeKpi>
  );
}
