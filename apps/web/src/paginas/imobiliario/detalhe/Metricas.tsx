import type {
  DetalheImobiliario,
  InvestimentoImobiliario,
  MetricasImobiliario,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { receitaTemporada } from "@zentrade/financas";
import { NumeroAnimado } from "../../../componentes/NumeroAnimado";
import { sinalDe } from "../../../lib/formatar";
import { FONTE_VALOR, formatarReais, formatarTaxa } from "../formato";

/** Os números do investimento, cada um com a frase que diz de onde vem. */
const reais = (t: string) => formatarReais(t);
const classeDoSinal = (v: string) => (sinalDe(v) === "neutro" ? "" : sinalDe(v));

function Item({
  rotulo,
  valor,
  nota,
  cor = false,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly nota: string;
  readonly cor?: boolean;
}) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd className={`num ${cor ? classeDoSinal(valor) : ""}`}>{formatarReais(valor, { sinal: cor })}</dd>
      <dd className="metrica__nota apagado">{nota}</dd>
    </div>
  );
}

function Destaque({ m }: { readonly m: MetricasImobiliario }) {
  return (
    <div className="imob-metricas__destaque">
      <dt>{m.encerrado ? "Resultado líquido (encerrado)" : "Patrimônio líquido"}</dt>
      <dd>
        {m.encerrado ? (
          <NumeroAnimado
            valor={m.resultadoLiquido}
            formatar={(t) => formatarReais(t, { sinal: true })}
            className={classeDoSinal(m.resultadoLiquido)}
          />
        ) : (
          <NumeroAnimado valor={m.patrimonioLiquido} formatar={reais} />
        )}
      </dd>
      <dd className="metrica__nota apagado">
        {m.encerrado
          ? "o investimento foi vendido"
          : `valor atual ${FONTE_VALOR[m.fonteValorAtual]}, menos dívidas`}
      </dd>
    </div>
  );
}

function Retorno({ m }: { readonly m: MetricasImobiliario }) {
  return (
    <>
      <div>
        <dt>TIR realizada</dt>
        <dd className="num">{m.tirAnual === null ? "—" : `${formatarTaxa(m.tirAnual)} a.a.`}</dd>
        <dd className="metrica__nota apagado">
          {m.tirAnual === null
            ? "precisa de saídas e entradas em datas diferentes"
            : "pelas datas de cada lançamento"}
        </dd>
      </div>
      {m.cdi ? (
        <Item
          rotulo={`Comparado ao CDI de ${formatarTaxa(m.cdi.taxaAnual)}`}
          valor={m.cdi.diferenca}
          cor
          nota={`o mesmo dinheiro no CDI valeria ${formatarReais(m.cdi.valorEquivalente)} (bruto, sem IR)`}
        />
      ) : null}
    </>
  );
}

export function MetricasPrincipais({ m }: { readonly m: MetricasImobiliario }) {
  return (
    <dl className="imob-metricas">
      <Destaque m={m} />
      <Item rotulo="Investido" valor={m.investido} nota="soma dos aportes" />
      <Item
        rotulo="Renda acumulada"
        valor={m.rendaAcumulada}
        nota={`média de ${formatarReais(m.rendaMensalMedia)} por mês em 12 meses`}
      />
      <Item
        rotulo="Despesas e impostos"
        valor={dec(m.despesas).plus(m.impostos).toFixed()}
        nota="custos lançados"
      />
      <Item
        rotulo="Resultado bruto"
        valor={m.resultadoBruto}
        cor
        nota="patrimônio + vendas + renda − aportes − parcelas"
      />
      <Item rotulo="Resultado líquido" valor={m.resultadoLiquido} cor nota="bruto − despesas − impostos" />
      <Retorno m={m} />
    </dl>
  );
}

type Fato = readonly [string, string];

function fatosDeCotas(d: DetalheImobiliario, m: MetricasImobiliario): Fato[] {
  const f: Fato[] = [];
  if (m.cotas) {
    f.push(["Cotas", m.cotas.quantidade.replace(".", ",")]);
    f.push(["Preço médio", m.cotas.precoMedio ? formatarReais(m.cotas.precoMedio) : "—"]);
    f.push(["Resultado em vendas", formatarReais(m.cotas.resultadoRealizado, { sinal: true })]);
    f.push(["Dividend yield (12 meses)", formatarTaxa(m.dividendYield)]);
  }
  if (d.cotacao) f.push([`Cotação ${d.cotacao.ticker} (brapi)`, formatarReais(d.cotacao.preco)]);
  if (m.valorAtualMoeda) f.push(["Valor atual em dólar", `US$ ${m.valorAtualMoeda.replace(".", ",")}`]);
  return f;
}

function fatosDeDivida(m: MetricasImobiliario): Fato[] {
  const f: Fato[] = [];
  if (m.financiamento) {
    f.push(["Parcelas pagas", String(m.financiamento.parcelasPagas)]);
    f.push(["Parcelas pagas (R$)", formatarReais(m.parcelasPagas)]);
    f.push(["Juros, seguros e tarifas pagos", formatarReais(m.financiamento.jurosPagos)]);
    f.push(["Saldo devedor", formatarReais(m.financiamento.saldoDevedor)]);
  }
  const c = m.consorcio;
  if (c) {
    f.push(["Parcela estimada", formatarReais(c.parcelaEstimada)]);
    f.push(["Parcelas pagas", `${c.parcelasPagas} de ${c.parcelasPagas + c.parcelasRestantes}`]);
    f.push(["Lances", formatarReais(c.lances)]);
    f.push(["Saldo a pagar (estimado)", formatarReais(c.saldoEstimado)]);
    f.push(["Situação", c.contemplado ? "contemplado" : "aguardando contemplação"]);
  }
  return f;
}

function fatosDasPremissas(inv: InvestimentoImobiliario, m: MetricasImobiliario): Fato[] {
  const f: Fato[] = [];
  if (inv.tipo === "temporada" && inv.diaria && inv.ocupacao !== null) {
    const r = receitaTemporada({
      diaria: dec(inv.diaria),
      ocupacao: inv.ocupacao,
      taxaPlataforma: inv.taxaPlataforma ?? 0,
    });
    f.push(["Receita esperada por mês (premissas)", formatarReais(r.receitaBruta.minus(r.taxaPlataforma))]);
  }
  if (inv.dataEntrega) f.push(["Entrega prevista", inv.dataEntrega.split("-").reverse().join("/")]);
  if (inv.precoVendaAlvo && !m.encerrado) {
    const previsto = dec(inv.precoVendaAlvo).minus(m.investido).minus(m.despesas);
    f.push(["Resultado previsto na venda (antes de IR)", formatarReais(previsto, { sinal: true })]);
  }
  return f;
}

/** O que é próprio de cada tipo: cotas, financiamento, consórcio, premissas de temporada. */
export function FatosDoTipo({ d }: { readonly d: DetalheImobiliario }) {
  const m = d.metricas;
  const fatos = m
    ? [...fatosDeCotas(d, m), ...fatosDeDivida(m), ...fatosDasPremissas(d.investimento, m)]
    : [];
  if (fatos.length === 0) return null;
  return (
    <dl className="imob-fatos">
      {fatos.map(([dt, dd]) => (
        <div key={dt}>
          <dt>{dt}</dt>
          <dd className="num">{dd}</dd>
        </div>
      ))}
    </dl>
  );
}
