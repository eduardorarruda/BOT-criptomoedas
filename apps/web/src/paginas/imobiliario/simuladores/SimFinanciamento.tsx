import type { TabelaAmortizacaoDTO } from "@zentrade/contratos/esquemas";
import { simulacaoFinanciamentoEmTexto } from "@zentrade/financas";
import { useState } from "react";
import { Segmentado } from "../../../componentes/Segmentado";
import { Premissas } from "../componentes";
import { ResumoTabela, TabelaCompleta } from "../detalhe/Financiamento";
import { formatarReais, formatarTaxa } from "../formato";
import { GraficoBarras } from "../graficos/Barras";
import { GraficoLinhas } from "../graficos/Linhas";
import { financiamentoPorAno } from "../series";
import { AvisoConta, Campos, inteiro, pct, reais, useCalculo, useCampos } from "./comum";

/** SAC × Price nas mesmas condições: parcelas, juros, saldo e CET lado a lado. */
const INICIAL = {
  valor: "300.000",
  juros: "10,5",
  prazo: "360",
  seguroSaldo: "0,025",
  seguroFixo: "40",
  tarifa: "25",
  custos: "3.000",
};
type Valores = typeof INICIAL;

const DEFINICOES = [
  ["valor", "Valor financiado", "R$"],
  ["juros", "Juros ao ano (efetivos)", "%"],
  ["prazo", "Prazo", "meses"],
  ["seguroSaldo", "Seguro sobre o saldo, ao mês", "%", "MIP: cobrado sobre o saldo devedor."],
  ["seguroFixo", "Seguro fixo por mês", "R$", "DFI ou outro seguro de valor fixo."],
  ["tarifa", "Tarifa mensal do contrato", "R$"],
  ["custos", "Custos na contratação", "R$", "Avaliação, registro do contrato: só entram no CET."],
] as const;

function calcular(v: Valores) {
  return simulacaoFinanciamentoEmTexto({
    valorFinanciado: reais(v.valor, "Valor financiado").toFixed(),
    taxaAnual: pct(v.juros, "Juros"),
    prazoMeses: inteiro(v.prazo, "Prazo", 1, 600),
    seguroTaxaMensalSaldo: pct(v.seguroSaldo, "Seguro sobre o saldo", true),
    seguroFixoMensal: reais(v.seguroFixo, "Seguro fixo", true).toFixed(),
    taxaAdministracaoMensal: reais(v.tarifa, "Tarifa", true).toFixed(),
    custosIniciais: reais(v.custos, "Custos", true).toFixed(),
  });
}

const PREMISSAS = [
  "Taxa anual efetiva convertida na mensal equivalente; parcelas sem correção (TR, IPCA).",
  "Seguros simplificados: um percentual mensal sobre o saldo e um valor fixo.",
  "CET aproximado: a taxa que iguala o valor recebido (menos custos iniciais) a tudo o que se paga.",
  "Centavos arredondados a cada parcela; a diferença fica na última.",
];

function LadoALado({
  sac,
  price,
}: {
  readonly sac: TabelaAmortizacaoDTO;
  readonly price: TabelaAmortizacaoDTO;
}) {
  const coluna = (nome: string, t: TabelaAmortizacaoDTO) => (
    <div>
      <h3>{nome}</h3>
      <p>
        Primeira parcela <strong className="num">{formatarReais(t.primeiraParcela)}</strong>
      </p>
      <p>
        Última parcela <strong className="num">{formatarReais(t.ultimaParcela)}</strong>
      </p>
      <p>
        Total de juros <strong className="num">{formatarReais(t.totalJuros)}</strong>
      </p>
      <p>
        Total pago <strong className="num">{formatarReais(t.totalPago)}</strong>
      </p>
      <p>
        CET aproximado{" "}
        <strong className="num">{t.cetAnual === null ? "—" : `${formatarTaxa(t.cetAnual)} a.a.`}</strong>
      </p>
    </div>
  );
  return (
    <div className="imob-lado-a-lado">
      {coluna("SAC — parcelas que caem", sac)}
      {coluna("Price — parcelas iguais", price)}
    </div>
  );
}

const SISTEMAS = [
  { valor: "SAC", rotulo: "SAC" },
  { valor: "PRICE", rotulo: "Price" },
] as const;

const reaisDe = (v: number) => formatarReais(String(v));
const eixo = (v: number) => formatarReais(String(v), { compacto: true });

function Resultado({
  sac,
  price,
}: {
  readonly sac: TabelaAmortizacaoDTO;
  readonly price: TabelaAmortizacaoDTO;
}) {
  const [ver, setVer] = useState<"SAC" | "PRICE">("SAC");
  const anosSac = financiamentoPorAno(sac.linhas);
  const anosPrice = financiamentoPorAno(price.linhas);
  const escolhida = ver === "SAC" ? sac : price;
  const anos = ver === "SAC" ? anosSac : anosPrice;
  return (
    <>
      <LadoALado sac={sac} price={price} />
      <GraficoLinhas
        titulo="Saldo devedor ao fim de cada ano"
        descricao="no SAC o saldo cai em linha reta; na Price, mais devagar no começo"
        rotulos={anosSac.map((a) => `ano ${a.ano}`)}
        series={[
          { nome: "SAC", cor: 1, valores: anosSac.map((a) => a.saldoFinal) },
          { nome: "Price", cor: 2, valores: anosPrice.map((a) => a.saldoFinal) },
        ]}
        formatar={reaisDe}
        formatarEixo={eixo}
      />
      <Segmentado rotulo="Ver juros × amortização de" opcoes={SISTEMAS} valor={ver} aoMudar={setVer} />
      <GraficoBarras
        titulo={`Juros e amortização por ano (${ver === "SAC" ? "SAC" : "Price"})`}
        descricao="quanto de cada ano pago foi juro e quanto abateu a dívida"
        rotulos={anos.map((a) => `ano ${a.ano}`)}
        empilhado
        series={[
          { nome: "Amortização", cor: 1, valores: anos.map((a) => a.amortizacao) },
          { nome: "Juros", cor: 3, valores: anos.map((a) => a.juros) },
        ]}
        formatar={reaisDe}
        formatarEixo={eixo}
      />
      <ResumoTabela tabela={escolhida} />
      <TabelaCompleta tabela={escolhida} />
    </>
  );
}

export function SimFinanciamento() {
  const { valores, mudar } = useCampos(INICIAL);
  const { resultado, erro } = useCalculo(valores, calcular);
  return (
    <div className="imob-sim">
      <div className="imob-sim__campos">
        <Campos definicoes={DEFINICOES} valores={valores} mudar={mudar} />
      </div>
      <div className="imob-sim__resultado">
        {erro ? <AvisoConta erro={erro} /> : null}
        {resultado ? <Resultado sac={resultado.sac} price={resultado.price} /> : null}
        <Premissas itens={PREMISSAS} />
      </div>
    </div>
  );
}
