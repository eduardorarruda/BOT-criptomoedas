import { receitaTemporada, rentabilidadeImovel, type ResultadoRentabilidade } from "@zentrade/financas";
import { Segmentado } from "../../../componentes/Segmentado";
import { Premissas } from "../componentes";
import { formatarAnos, formatarReais, formatarTaxa } from "../formato";
import { GraficoBarras } from "../graficos/Barras";
import { AvisoConta, Campos, inteiro, pct, reais, useCalculo, useCampos } from "./comum";

/** Rentabilidade de um imóvel: cap rate, yields, TIR, VPL e payback sob as suas premissas. */
const INICIAL = {
  modo: "aluguel",
  valor: "400.000",
  custos: "16.000",
  reforma: "0",
  entrada: "400.000",
  juros: "11",
  prazo: "360",
  aluguel: "2.200",
  diaria: "280",
  ocupacao: "50",
  plataforma: "15",
  vacancia: "8,33",
  administracao: "8",
  despesas: "180",
  reajuste: "4,5",
  valorizacao: "4",
  horizonte: "10",
  corretagem: "5",
  desconto: "10",
};
type Valores = typeof INICIAL;

const COMPRA = [
  ["valor", "Valor de compra", "R$"],
  ["custos", "ITBI, escritura e registro", "R$"],
  ["reforma", "Reforma e mobília", "R$"],
  [
    "entrada",
    "Entrada",
    "R$",
    "Igual ao valor de compra = à vista; menos que isso, o resto é financiado (SAC).",
  ],
  ["juros", "Juros do financiamento ao ano", "%"],
  ["prazo", "Prazo do financiamento", "meses"],
] as const;
const ALUGUEL = [
  ["aluguel", "Aluguel mensal", "R$"],
  ["vacancia", "Vacância", "%", "8,33% = um mês vazio por ano."],
  ["administracao", "Taxa da administradora", "%"],
] as const;
const TEMPORADA = [
  ["diaria", "Diária média", "R$"],
  ["ocupacao", "Ocupação média", "%"],
  ["plataforma", "Taxa da plataforma", "%"],
] as const;
const RESTO = [
  ["despesas", "Despesas do proprietário por mês", "R$", "IPTU, condomínio vago, manutenção, seguro."],
  ["reajuste", "Reajuste anual da renda e despesas", "%"],
  ["valorizacao", "Valorização do imóvel ao ano", "%"],
  ["horizonte", "Vender depois de", "anos"],
  ["corretagem", "Corretagem na venda", "%"],
  [
    "desconto",
    "Taxa de desconto ao ano (VPL)",
    "%",
    "Quanto você exige ao ano, por exemplo o CDI que espera.",
  ],
] as const;

function renda(v: Valores) {
  if (v.modo !== "temporada") {
    return {
      rendaMensal: reais(v.aluguel, "Aluguel"),
      vacancia: pct(v.vacancia, "Vacância", true),
      taxaAdministracao: pct(v.administracao, "Administração", true),
    };
  }
  const t = receitaTemporada({
    diaria: reais(v.diaria, "Diária"),
    ocupacao: pct(v.ocupacao, "Ocupação"),
    taxaPlataforma: pct(v.plataforma, "Plataforma", true),
  });
  return { rendaMensal: t.receitaBruta.minus(t.taxaPlataforma), vacancia: 0, taxaAdministracao: 0 };
}

function calcular(v: Valores) {
  const valorCompra = reais(v.valor, "Valor de compra");
  const entrada = reais(v.entrada, "Entrada");
  return rentabilidadeImovel({
    valorCompra,
    custosAquisicao: reais(v.custos, "Custos", true),
    reforma: reais(v.reforma, "Reforma", true),
    entrada,
    ...(entrada.lt(valorCompra)
      ? {
          financiamento: {
            sistema: "SAC" as const,
            taxaAnual: pct(v.juros, "Juros"),
            prazoMeses: inteiro(v.prazo, "Prazo", 1, 600),
          },
        }
      : {}),
    ...renda(v),
    despesasMensais: reais(v.despesas, "Despesas", true),
    reajusteAnual: pct(v.reajuste, "Reajuste", true),
    valorizacaoAnual: pct(v.valorizacao, "Valorização", true),
    horizonteAnos: inteiro(v.horizonte, "Horizonte", 1, 50),
    custoVenda: pct(v.corretagem, "Corretagem", true),
    taxaDescontoAnual: pct(v.desconto, "Taxa de desconto"),
  });
}

function Resultado({ r }: { readonly r: ResultadoRentabilidade }) {
  const indicadores: [string, string][] = r
    ? [
        ["Capital próprio", formatarReais(r.capitalProprio)],
        ["Renda líquida no 1º mês", formatarReais(r.rendaLiquidaMensalInicial)],
        ["Cap rate", formatarTaxa(r.capRate)],
        ["Yield bruto", formatarTaxa(r.yieldBruto)],
        ["Yield líquido", formatarTaxa(r.yieldLiquido)],
        ["Cash-on-cash (ano 1)", formatarTaxa(r.cashOnCashAno1)],
        ["TIR", r.tirAnual === null ? "—" : `${formatarTaxa(r.tirAnual)} a.a.`],
        ["VPL", formatarReais(r.vpl, { sinal: true })],
        ["Payback simples", formatarAnos(r.payback)],
        ["Payback descontado", formatarAnos(r.paybackDescontado)],
      ]
    : [];
  return (
    <>
      <dl className="imob-fatos">
        {indicadores.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd className="num">{dd}</dd>
          </div>
        ))}
      </dl>
      <GraficoBarras
        titulo="Fluxo de caixa por ano"
        descricao="ano 0 é a compra (com custos); o último ano inclui a venda menos corretagem e saldo devedor"
        rotulos={r.fluxos.map((_, i) => `ano ${i}`)}
        series={[{ nome: "Fluxo de caixa", cor: 2, valores: r.fluxos.map((f) => f.toNumber()) }]}
        formatar={(v) => formatarReais(String(v))}
        formatarEixo={(v) => formatarReais(String(v), { compacto: true })}
      />
    </>
  );
}

export function SimRentabilidade() {
  const { valores, mudar } = useCampos(INICIAL);
  const { resultado: r, erro } = useCalculo(valores, calcular);
  return (
    <div className="imob-sim">
      <div className="imob-sim__campos">
        <Segmentado
          rotulo="Renda"
          opcoes={[
            { valor: "aluguel", rotulo: "Aluguel mensal" },
            { valor: "temporada", rotulo: "Temporada" },
          ]}
          valor={valores.modo === "temporada" ? "temporada" : "aluguel"}
          aoMudar={mudar("modo")}
        />
        <Campos definicoes={COMPRA} valores={valores} mudar={mudar} />
        <Campos
          definicoes={valores.modo === "temporada" ? TEMPORADA : ALUGUEL}
          valores={valores}
          mudar={mudar}
        />
        <Campos definicoes={RESTO} valores={valores} mudar={mudar} />
      </div>
      <div className="imob-sim__resultado">
        {erro ? <AvisoConta erro={erro} /> : null}
        {r ? <Resultado r={r} /> : null}
        <Premissas itens={r?.premissas ?? []} />
      </div>
    </div>
  );
}
