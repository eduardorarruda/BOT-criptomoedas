import type { TabelaAmortizacaoDTO } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { formatarReais, formatarTaxa } from "../formato";
import { GraficoBarras } from "../graficos/Barras";
import { TabelaDados } from "../graficos/comum";
import { GraficoLinhas } from "../graficos/Linhas";
import { financiamentoPorAno } from "../series";

/** Financiamento: evolução do saldo, juros × amortização por ano e a tabela completa. */
const reais = (v: number) => formatarReais(String(v));
const eixo = (v: number) => formatarReais(String(v), { compacto: true });

export function ResumoTabela({ tabela }: { readonly tabela: TabelaAmortizacaoDTO }) {
  return (
    <dl className="imob-fatos">
      <div>
        <dt>Juros ao mês (equivalente)</dt>
        <dd className="num">{formatarTaxa(tabela.taxaMensal, 4)}</dd>
      </div>
      <div>
        <dt>Primeira parcela</dt>
        <dd className="num">{formatarReais(tabela.primeiraParcela)}</dd>
      </div>
      <div>
        <dt>Última parcela</dt>
        <dd className="num">{formatarReais(tabela.ultimaParcela)}</dd>
      </div>
      <div>
        <dt>Total de juros</dt>
        <dd className="num">{formatarReais(tabela.totalJuros)}</dd>
      </div>
      <div>
        <dt>Seguros e tarifas</dt>
        <dd className="num">{formatarReais(dec(tabela.totalSeguros).plus(tabela.totalTaxas))}</dd>
      </div>
      <div>
        <dt>Total pago</dt>
        <dd className="num">{formatarReais(tabela.totalPago)}</dd>
      </div>
      <div>
        <dt>CET aproximado</dt>
        <dd className="num">{tabela.cetAnual === null ? "—" : `${formatarTaxa(tabela.cetAnual)} a.a.`}</dd>
      </div>
    </dl>
  );
}

export function TabelaCompleta({ tabela }: { readonly tabela: TabelaAmortizacaoDTO }) {
  return (
    <TabelaDados
      titulo={`tabela ${tabela.sistema === "SAC" ? "SAC" : "Price"} mês a mês`}
      cabecalho={[
        "Parcela",
        "Vencimento",
        "Juros",
        "Amortização",
        "Seguros e tarifas",
        "Parcela total",
        "Saldo",
      ]}
      linhas={tabela.linhas.map((l) => [
        l.mes,
        l.vencimento ? l.vencimento.split("-").reverse().join("/") : "—",
        formatarReais(l.juros),
        formatarReais(l.amortizacao),
        formatarReais(dec(l.seguros).plus(l.taxaAdministracao)),
        formatarReais(l.parcelaTotal),
        formatarReais(l.saldoFinal),
      ])}
    />
  );
}

export function FinanciamentoDetalhe({ tabela }: { readonly tabela: TabelaAmortizacaoDTO }) {
  const anos = financiamentoPorAno(tabela.linhas);
  const rotulos = anos.map((a) => `ano ${a.ano}`);
  return (
    <div className="pilha">
      <ResumoTabela tabela={tabela} />
      <GraficoLinhas
        titulo="Saldo devedor ao fim de cada ano"
        descricao={`começa em ${formatarReais(tabela.linhas[0]?.saldoInicial ?? "0")} e chega a zero na última parcela`}
        rotulos={rotulos}
        series={[{ nome: "Saldo devedor", cor: 2, valores: anos.map((a) => a.saldoFinal) }]}
        formatar={reais}
        formatarEixo={eixo}
      />
      <GraficoBarras
        titulo="Juros e amortização por ano"
        descricao="quanto de cada ano pago foi juro e quanto abateu a dívida"
        rotulos={rotulos}
        empilhado
        series={[
          { nome: "Amortização", cor: 1, valores: anos.map((a) => a.amortizacao) },
          { nome: "Juros", cor: 3, valores: anos.map((a) => a.juros) },
        ]}
        formatar={reais}
        formatarEixo={eixo}
      />
      <TabelaCompleta tabela={tabela} />
    </div>
  );
}
