import type { AmostraValidacao, MonteCarlo, ResumoTrecho, WalkForward } from "@zentrade/contratos/esquemas";
import { Dices, Footprints, SplitSquareHorizontal } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { CartaoKpi, GradeKpi } from "../../componentes/Kpi";
import { Selo } from "../../componentes/Selo";
import { GraficoBarras } from "../imobiliario/graficos/Barras";
import { GraficoLinhas } from "../imobiliario/graficos/Linhas";
import { dataDoEixo, pct, pctSinal, razao } from "./formato";

const LINHAS_TRECHO: readonly { rotulo: string; valor: (t: ResumoTrecho) => string }[] = [
  { rotulo: "Retorno", valor: (t) => pctSinal(t.retorno) },
  { rotulo: "Sharpe (anual)", valor: (t) => razao(t.sharpe) },
  { rotulo: "Maior queda", valor: (t) => pct(t.maiorQuedaPercentual) },
  { rotulo: "Operações fechadas", valor: (t) => String(t.operacoes) },
  { rotulo: "Taxa de acerto", valor: (t) => pct(t.taxaAcerto, 0) },
  { rotulo: "Buy and hold no trecho", valor: (t) => pctSinal(t.buyHoldRetorno) },
];

const periodo = (t: ResumoTrecho) => `${dataDoEixo(t.inicio)} a ${dataDoEixo(t.fim)}`;

function Amostra({ a, id }: { readonly a: AmostraValidacao; readonly id: string }) {
  const dentro = Math.round(a.fracaoDentro * 100);
  return (
    <Painel
      titulo="Dentro × fora da amostra"
      id={`amostra-${id}`}
      icone={SplitSquareHorizontal}
      descricao={`Os primeiros ${dentro}% do período contra os ${100 - dentro}% finais, que funcionam como dados "não vistos". Se você ajustou a estratégia olhando o começo, o fim é a prova.`}
      acoes={
        a.degradou ? (
          <Selo tom="perda">Piorou fora da amostra</Selo>
        ) : a.fora.retorno > 0 ? (
          <Selo tom="ganho">Manteve fora da amostra</Selo>
        ) : (
          <Selo tom="atencao">Sem lucro fora da amostra</Selo>
        )
      }
    >
      <div className="tabela-rolagem">
        <table className="tabela tabela--zebra bt-tabela">
          <caption className="so-leitor">Comparação dentro e fora da amostra</caption>
          <thead>
            <tr>
              <th scope="col">Medida</th>
              <th scope="col" className="tabela__num">
                Dentro ({periodo(a.dentro)})
              </th>
              <th scope="col" className="tabela__num">
                Fora ({periodo(a.fora)})
              </th>
            </tr>
          </thead>
          <tbody>
            {LINHAS_TRECHO.map((l) => (
              <tr key={l.rotulo}>
                <th scope="row">{l.rotulo}</th>
                <td className="tabela__num num">{l.valor(a.dentro)}</td>
                <td className="tabela__num num">{l.valor(a.fora)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.motivo ? <p className="bt-nota">Por quê: {a.motivo}.</p> : null}
    </Painel>
  );
}

function JanelasWf({ w, id }: { readonly w: WalkForward; readonly id: string }) {
  const e = w.estabilidade;
  const positivas = Math.round(e.fracaoPositivas * w.janelas.length);
  return (
    <Painel
      titulo="Walk-forward"
      id={`wf-${id}`}
      icone={Footprints}
      descricao={`A mesma estratégia em ${w.janelas.length} janelas de teste seguidas (${w.modo === "rolante" ? "referência rolante" : "referência ancorada no início"}). Resultado que se repete no tempo pesa mais que um trecho de sorte.`}
    >
      <GradeKpi rotulo="Estabilidade entre as janelas" colunas={4}>
        <CartaoKpi
          rotulo="Janelas no lucro"
          valor={<span className="num">{`${positivas} de ${w.janelas.length}`}</span>}
        />
        <CartaoKpi
          rotulo="Retorno por janela"
          valor={<span className="num">{pctSinal(e.mediaRetorno)}</span>}
          nota={`Desvio de ${pct(e.desvioRetorno)} entre janelas.`}
        />
        <CartaoKpi
          rotulo="Sharpe por janela"
          valor={<span className="num">{razao(e.mediaSharpe)}</span>}
          nota={`Desvio de ${razao(e.desvioSharpe)}.`}
        />
        <CartaoKpi
          rotulo="Eficiência média"
          valor={<span className="num">{pct(e.eficienciaMedia, 0)}</span>}
          nota="Retorno por dia no teste ÷ na referência (Pardo)."
        />
      </GradeKpi>
      <GraficoBarras
        titulo="Retorno em cada janela de teste"
        descricao={`${positivas} de ${w.janelas.length} janelas terminaram no lucro; compare com o buy and hold de cada uma.`}
        rotulos={w.janelas.map((j) => `J${j.indice + 1}`)}
        series={[
          { nome: "Estratégia", cor: 3, valores: w.janelas.map((j) => j.fora.retorno) },
          { nome: "Buy and hold", cor: 2, valores: w.janelas.map((j) => j.fora.buyHoldRetorno) },
        ]}
        formatar={(v) => pctSinal(v)}
        formatarEixo={(v) => pct(v, 0)}
        altura={200}
      />
      <div className="tabela-rolagem">
        <table className="tabela tabela--zebra bt-tabela">
          <caption className="so-leitor">Janelas do walk-forward</caption>
          <thead>
            <tr>
              <th scope="col">Janela de teste</th>
              <th scope="col" className="tabela__num">
                Retorno
              </th>
              <th scope="col" className="tabela__num">
                Sharpe
              </th>
              <th scope="col" className="tabela__num">
                Operações
              </th>
              <th scope="col" className="tabela__num">
                Buy and hold
              </th>
              <th scope="col" className="tabela__num">
                Na referência
              </th>
              <th scope="col" className="tabela__num">
                Eficiência
              </th>
            </tr>
          </thead>
          <tbody>
            {w.janelas.map((j) => (
              <tr key={j.indice}>
                <th scope="row">
                  J{j.indice + 1} <span className="apagado">{periodo(j.fora)}</span>
                </th>
                <td className={`tabela__num num ${j.fora.retorno >= 0 ? "ganho" : "perda"}`}>
                  {pctSinal(j.fora.retorno)}
                </td>
                <td className="tabela__num num">{razao(j.fora.sharpe)}</td>
                <td className="tabela__num num">{j.fora.operacoes}</td>
                <td className="tabela__num num">{pctSinal(j.fora.buyHoldRetorno)}</td>
                <td className="tabela__num num">{pctSinal(j.dentro.retorno)}</td>
                <td className="tabela__num num">{pct(j.eficiencia, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Painel>
  );
}

function MonteCarloPainel({ mc, id }: { readonly mc: MonteCarlo; readonly id: string }) {
  const faixas = (r: { p5: number; p50: number; p95: number }, f: (v: number) => string) =>
    `${f(r.p5)} · ${f(r.p50)} · ${f(r.p95)}`;
  return (
    <Painel
      titulo="Monte Carlo das operações"
      id={`mc-${id}`}
      icone={Dices}
      descricao={`${mc.simulacoes} sequências sorteadas (com reposição) das ${mc.operacoes} operações, semente ${mc.semente}: o mesmo jogo, em outra ordem e com outra sorte.`}
    >
      <GradeKpi rotulo="Faixas do Monte Carlo" colunas={3}>
        <CartaoKpi
          rotulo="Retorno final (5% · 50% · 95%)"
          valor={<span className="num">{pctSinal(mc.retornoFinal.p50)}</span>}
          nota={faixas(mc.retornoFinal, (v) => pctSinal(v))}
        />
        <CartaoKpi
          rotulo="Maior queda (5% · 50% · 95%)"
          valor={<span className="num">{pct(mc.maiorQueda.p50)}</span>}
          nota={faixas(mc.maiorQueda, (v) => pct(v))}
        />
        <CartaoKpi
          rotulo={`Chance de ruína (perder ${pct(mc.limiteRuina, 0)})`}
          valor={<span className="num">{pct(mc.probabilidadeRuina)}</span>}
          {...(mc.probabilidadeRuina >= 0.05 ? { tom: "atencao" as const } : {})}
          nota="Em algum momento da sequência, não só no fim."
        />
      </GradeKpi>
      <div className="bt-graficos">
        <GraficoLinhas
          titulo="Leque do patrimônio, operação a operação"
          descricao={`na mediana o patrimônio termina em ${pctSinal(mc.retornoFinal.p50)}; em 90% das sequências, entre ${pctSinal(mc.retornoFinal.p5)} e ${pctSinal(mc.retornoFinal.p95)}.`}
          rotulos={mc.leque.map((p) => `${p.operacao}`)}
          series={[
            { nome: "Pior 5%", cor: "perda", valores: mc.leque.map((p) => p.p5 - 1) },
            { nome: "Mediana", cor: 3, valores: mc.leque.map((p) => p.p50 - 1) },
            { nome: "Melhor 5%", cor: "ganho", valores: mc.leque.map((p) => p.p95 - 1) },
          ]}
          formatar={(v) => pctSinal(v)}
          formatarEixo={(v) => pct(v, 0)}
          altura={200}
        />
        <GraficoBarras
          titulo="Distribuição do retorno final"
          descricao={`quantas das ${mc.simulacoes} sequências terminaram em cada faixa de retorno.`}
          rotulos={mc.histograma.map((h) => `${pctSinal(h.de, 0)} a ${pctSinal(h.ate, 0)}`)}
          series={[{ nome: "Sequências", cor: 4, valores: mc.histograma.map((h) => h.quantidade) }]}
          formatar={(v) => `${v} sequências`}
          formatarEixo={(v) => String(v)}
          altura={200}
        />
      </div>
      <p className="bt-nota">
        Supõe que cada operação independe das outras. Se as perdas vêm em sequência por causa do mercado (o
        que acontece), o risco real é maior que o mostrado aqui.
      </p>
    </Painel>
  );
}

export function ValidacaoBacktest({ b }: { readonly b: Backtest }) {
  const v = b.validacao;
  if (!v) return null;
  return (
    <>
      {v.amostra ? <Amostra a={v.amostra} id={b.id} /> : null}
      {v.walkForward ? <JanelasWf w={v.walkForward} id={b.id} /> : null}
      {v.monteCarlo ? (
        <MonteCarloPainel mc={v.monteCarlo} id={b.id} />
      ) : (
        <Painel titulo="Monte Carlo das operações" id={`mc-${b.id}`} icone={Dices}>
          <p className="bt-nota">Poucas operações para sortear sequências: o Monte Carlo não foi feito.</p>
        </Painel>
      )}
    </>
  );
}
