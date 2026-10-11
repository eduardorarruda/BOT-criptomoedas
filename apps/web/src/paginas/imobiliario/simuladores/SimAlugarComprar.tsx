import { alugarOuComprar, type ResultadoAlugarComprar } from "@zentrade/financas";
import { Premissas } from "../componentes";
import { formatarReais } from "../formato";
import { GraficoLinhas } from "../graficos/Linhas";
import { AvisoConta, Campos, inteiro, pct, reais, useCalculo, useCampos } from "./comum";

/**
 * Alugar × comprar: os dois cenários gastam o mesmo dinheiro; quem gasta menos no
 * mês aplica a diferença à taxa de oportunidade. Mostra o patrimônio de cada um.
 */
const INICIAL = {
  valor: "500.000",
  entrada: "150.000",
  custos: "25.000",
  juros: "11",
  prazo: "360",
  aluguel: "2.500",
  reajuste: "4,5",
  custosProprietario: "250",
  valorizacao: "4",
  oportunidade: "10",
  horizonte: "10",
  corretagem: "5",
};
type Valores = typeof INICIAL;

const DEFINICOES = [
  ["valor", "Valor do imóvel", "R$"],
  ["entrada", "Entrada", "R$", "O resto é financiado (SAC)."],
  ["custos", "ITBI, escritura e registro", "R$"],
  ["juros", "Juros do financiamento ao ano", "%"],
  ["prazo", "Prazo do financiamento", "meses"],
  ["aluguel", "Aluguel do mesmo imóvel", "R$"],
  ["reajuste", "Reajuste anual do aluguel e dos custos", "%"],
  ["custosProprietario", "Custos só do proprietário por mês", "R$", "IPTU, manutenção, seguro."],
  ["valorizacao", "Valorização do imóvel ao ano", "%"],
  [
    "oportunidade",
    "Rendimento do dinheiro aplicado ao ano",
    "%",
    "Taxa de oportunidade: informe já sem IR, se quiser.",
  ],
  ["horizonte", "Horizonte", "anos"],
  ["corretagem", "Corretagem para vender no fim", "%"],
] as const;

function calcular(v: Valores) {
  const valorImovel = reais(v.valor, "Valor do imóvel");
  const entrada = reais(v.entrada, "Entrada");
  return alugarOuComprar({
    valorImovel,
    entrada,
    custosCompra: reais(v.custos, "Custos", true),
    ...(entrada.lt(valorImovel)
      ? {
          financiamento: {
            sistema: "SAC" as const,
            taxaAnual: pct(v.juros, "Juros"),
            prazoMeses: inteiro(v.prazo, "Prazo", 1, 600),
          },
        }
      : {}),
    aluguelMensal: reais(v.aluguel, "Aluguel"),
    reajusteAnual: pct(v.reajuste, "Reajuste", true),
    custosProprietarioMensais: reais(v.custosProprietario, "Custos do proprietário", true),
    valorizacaoAnual: pct(v.valorizacao, "Valorização", true),
    taxaOportunidadeAnual: pct(v.oportunidade, "Rendimento"),
    horizonteMeses: inteiro(v.horizonte, "Horizonte", 1, 50) * 12,
    custoVendaFinal: pct(v.corretagem, "Corretagem", true),
  });
}

function Resultado({ r }: { readonly r: ResultadoAlugarComprar }) {
  const anuais = r.meses.filter((m) => m.mes % 12 === 0);
  const quem = r.final.maiorPatrimonio === "comprar" ? "compra" : "aluga";
  const frase =
    r.final.maiorPatrimonio === "igual"
      ? "Com estas premissas, os dois caminhos terminam com o mesmo patrimônio."
      : `Com estas premissas, quem ${quem} termina com ${formatarReais(r.final.diferenca.abs())} a mais.`;
  return (
    <>
      <div className="imob-lado-a-lado">
        <div>
          <h3>Comprar</h3>
          <p>
            Patrimônio no fim <strong className="num">{formatarReais(r.final.comprar)}</strong>
          </p>
          <p className="apagado">imóvel (menos corretagem e saldo devedor) + o que sobrou aplicado</p>
        </div>
        <div>
          <h3>Alugar e aplicar</h3>
          <p>
            Patrimônio no fim <strong className="num">{formatarReais(r.final.alugar)}</strong>
          </p>
          <p className="apagado">entrada, custos e diferenças mensais aplicados</p>
        </div>
      </div>
      <p role="status">
        {frase}{" "}
        {r.mesEmQueComprarAlcanca
          ? `O patrimônio de quem compra alcança o de quem aluga no mês ${r.mesEmQueComprarAlcanca}.`
          : "No horizonte escolhido, o patrimônio de quem compra não alcança o de quem aluga."}
      </p>
      <GraficoLinhas
        titulo="Patrimônio ao fim de cada ano"
        descricao="comprar e alugar aplicando a diferença, sob as mesmas premissas"
        rotulos={anuais.map((m) => `ano ${m.mes / 12}`)}
        series={[
          { nome: "Comprar", cor: 1, valores: anuais.map((m) => m.patrimonioComprar.toNumber()) },
          {
            nome: "Alugar e aplicar",
            cor: 2,
            valores: anuais.map((m) => m.patrimonioAlugar.toNumber()),
          },
        ]}
        formatar={(v) => formatarReais(String(v))}
        formatarEixo={(v) => formatarReais(String(v), { compacto: true })}
      />
    </>
  );
}

export function SimAlugarComprar() {
  const { valores, mudar } = useCampos(INICIAL);
  const { resultado: r, erro } = useCalculo(valores, calcular);
  return (
    <div className="imob-sim">
      <div className="imob-sim__campos">
        <Campos definicoes={DEFINICOES} valores={valores} mudar={mudar} />
      </div>
      <div className="imob-sim__resultado">
        {erro ? <AvisoConta erro={erro} /> : null}
        {r ? <Resultado r={r} /> : null}
        <Premissas itens={r?.premissas ?? []} />
      </div>
    </div>
  );
}
