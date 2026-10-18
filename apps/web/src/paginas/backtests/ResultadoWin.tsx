import type { MetricasWin } from "@zentrade/contratos/esquemas";
import { Landmark } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { Dinheiro } from "../../componentes/Dinheiro";
import { CartaoKpi, GradeKpi, type TomKpi } from "../../componentes/Kpi";
import { TabelaRolagem } from "../../componentes/TabelaRolagem";
import { formatarDinheiro } from "../../lib/formatar";
import { pct, pctSinal, razao } from "./formato";

/**
 * O resultado do mini índice (WIN): reais e pontos, contratos, custos da B3, IR
 * estimado e as duas referências honestas (ficar de fora e sempre comprado na sessão).
 */
type Metricas = NonNullable<Backtest["metricas"]>;

export const reais = (v: string, sinal = false) => formatarDinheiro(v, { moeda: "R$", sinal });
const pontos = (v: string) =>
  `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" })} pontos`;
const tom = (v: number | null | undefined): TomKpi =>
  v === null || v === undefined || v === 0 ? "neutro" : v > 0 ? "ganho" : "perda";

function Resultado({ m, w }: { readonly m: Metricas; readonly w: MetricasWin }) {
  return (
    <>
      <CartaoKpi
        destaque
        rotulo="Resultado líquido"
        valor={<Dinheiro valor={m.resultadoLiquido} sinal colorir moeda="R$" />}
        variacao={`${pctSinal(m.resultadoPercentual)} sobre ${reais(m.saldoInicial ?? "0")}`}
        tomVariacao={tom(m.resultadoPercentual)}
        nota={`${pontos(w.pontosLiquidos)} depois de tarifas e deslizamento. Antes dos custos: ${reais(m.resultadoBruto ?? "0", true)}.`}
      />
      <CartaoKpi
        rotulo="Depois do IR (estimado)"
        valor={<Dinheiro valor={w.liquidoDepoisDoIr} sinal colorir moeda="R$" />}
        nota={`IR estimado de ${reais(w.irEstimado)}: 20% do lucro de cada mês, com o prejuízo compensado. Estimativa, não é parecer tributário.`}
      />
      <CartaoKpi
        rotulo="Por contrato"
        valor={<Dinheiro valor={w.resultadoPorContrato} sinal colorir moeda="R$" />}
        nota={`${pontos(w.pontosPorContrato)} por contrato; ${w.contratosNegociados} contratos negociados (cada um com entrada e saída).`}
      />
      <CartaoKpi
        rotulo="Custos do mini índice"
        valor={<span className="num perda">{reais(String(Number(w.custosB3) + Number(w.corretagem)))}</span>}
        nota={`Tarifas da B3 ${reais(w.custosB3)} e corretagem ${reais(w.corretagem)}, mais ${reais(w.deslizamentoPago)} de deslizamento (${pontos(w.deslizamentoPontos)}).`}
      />
    </>
  );
}

function Risco({ m, w }: { readonly m: Metricas; readonly w: MetricasWin }) {
  return (
    <>
      <CartaoKpi
        rotulo="Maior queda"
        valor={<Dinheiro valor={`-${m.maiorQueda}`} colorir moeda="R$" />}
        variacao={`${pct(m.maiorQuedaPercentual)} do pico`}
        tomVariacao="perda"
        nota="Do maior patrimônio até o menor depois dele, com as posições marcadas a mercado."
      />
      <CartaoKpi
        rotulo="Operações"
        valor={<span className="num">{m.operacoes}</span>}
        nota={`${pct(m.taxaAcerto, 0)} no lucro · ${w.operacoesCompradas} compradas e ${w.operacoesVendidas} vendidas · ${w.zeragens} fechadas pela zeragem do fim do dia.`}
      />
      <CartaoKpi
        rotulo="Referências"
        valor={<span className="num">{reais(w.sessao.resultado, true)}</span>}
        variacao={`ficar de fora: ${reais("0")}`}
        nota="Sempre comprado na sessão: 1 contrato da abertura até a zeragem, todo pregão, com os mesmos custos. Comprar e segurar não existe num futuro de day trade."
      />
      <CartaoKpi
        rotulo="Sharpe · fator de lucro"
        valor={
          <span className="num">
            {razao(m.sharpe)} · {razao(m.fatorLucro)}
          </span>
        }
        nota={`Sharpe anualizado pelos candles do pregão. Expectativa por operação: ${reais(m.expectativa ?? "0", true)}.`}
      />
    </>
  );
}

export function KpisWin({ m, w }: { readonly m: Metricas; readonly w: MetricasWin }) {
  return (
    <GradeKpi rotulo="Indicadores do backtest" className="bt-kpis">
      <Resultado m={m} w={w} />
      <Risco m={m} w={w} />
    </GradeKpi>
  );
}

/** IR estimado mês a mês, com o prejuízo levado adiante e o IRRF só como informação. */
export function ImpostoWin({ b, w }: { readonly b: Backtest; readonly w: MetricasWin }) {
  return (
    <Painel
      titulo="Imposto estimado (day trade)"
      id={`ir-${b.id}`}
      icone={Landmark}
      descricao={`IR estimado de ${reais(w.irEstimado)} no período; sobra ${reais(w.prejuizoACompensar)} de prejuízo para compensar.`}
    >
      <TabelaRolagem rotulo="IR estimado por mês (role para os lados)">
        <table className="tabela tabela--zebra bt-tabela">
          <caption className="so-leitor">IR estimado por mês</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col" className="tabela__num">
                Resultado
              </th>
              <th scope="col" className="tabela__num">
                Prejuízo compensado
              </th>
              <th scope="col" className="tabela__num">
                Base
              </th>
              <th scope="col" className="tabela__num">
                IR (20%)
              </th>
              <th scope="col" className="tabela__num">
                IRRF (1%, informativo)
              </th>
            </tr>
          </thead>
          <tbody>
            {w.meses.map((x) => (
              <tr key={x.mes}>
                <th scope="row">{x.mes.split("-").reverse().join("/")}</th>
                <td className="tabela__num num">{reais(x.resultado, true)}</td>
                <td className="tabela__num num">{reais(x.compensado)}</td>
                <td className="tabela__num num">{reais(x.base)}</td>
                <td className="tabela__num num">{reais(x.ir)}</td>
                <td className="tabela__num num">{reais(x.irrf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolagem>
      <p className="bt-nota">
        Estimativa para o relatório, não é parecer tributário. Day trade paga 20% sobre o lucro líquido do
        mês; o prejuízo de day trade abate o lucro de day trade dos meses seguintes, sem prazo. O IRRF de 1%
        sobre o resultado positivo de cada dia (o “dedo-duro”) é antecipação: abate o DARF (código 6015), não
        é custo a mais. A apuração de verdade é sua, com as notas de corretagem.
      </p>
    </Painel>
  );
}
