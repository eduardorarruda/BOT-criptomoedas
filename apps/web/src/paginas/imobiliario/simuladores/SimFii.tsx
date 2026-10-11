import { simularFii, type ResultadoSimulacaoFii } from "@zentrade/financas";
import { Segmentado } from "../../../componentes/Segmentado";
import { Premissas } from "../componentes";
import { formatarReais, formatarTaxa } from "../formato";
import { GraficoLinhas } from "../graficos/Linhas";
import { AvisoConta, Campos, inteiro, reais, useCalculo, useCampos } from "./comum";

/** FII: renda mensal para X cotas e a evolução, com ou sem reinvestir os proventos. */
const INICIAL = {
  cotas: "200",
  preco: "100",
  rendimento: "0,85",
  meses: "60",
  alvo: "1.000",
  reinvestir: "nao",
};
type Valores = typeof INICIAL;

const DEFINICOES = [
  ["cotas", "Cotas", "cotas"],
  ["preco", "Preço da cota", "R$"],
  ["rendimento", "Rendimento mensal por cota", "R$", "O último pago, por exemplo; ele muda todo mês."],
  ["meses", "Período", "meses"],
  ["alvo", "Renda mensal que você quer", "R$", "Para calcular quantas cotas dariam essa renda."],
] as const;

function calcular(v: Valores) {
  const alvo = v.alvo.trim() === "" ? null : reais(v.alvo, "Renda alvo");
  return simularFii({
    cotas: inteiro(v.cotas, "Cotas", 0, 10_000_000),
    precoCota: reais(v.preco, "Preço da cota"),
    rendimentoMensalPorCota: reais(v.rendimento, "Rendimento"),
    meses: inteiro(v.meses, "Período", 1, 600),
    reinvestir: v.reinvestir === "sim",
    ...(alvo ? { rendaAlvo: alvo } : {}),
  });
}

function Resultado({ r, reinvestir }: { readonly r: ResultadoSimulacaoFii; readonly reinvestir: boolean }) {
  const passo = Math.max(1, Math.ceil(r.meses.length / 40));
  const pontos = r.meses.filter((m, i) => i % passo === passo - 1 || m.mes === r.meses.length);
  const fatos: [string, string][] = r
    ? [
        ["Investimento", formatarReais(r.investimento)],
        ["Renda mensal", formatarReais(r.rendaMensal)],
        ["DY mensal", formatarTaxa(r.dyMensal)],
        ["DY anual (× 12)", formatarTaxa(r.dyAnual)],
        ...(r.cotasParaAlvo !== null
          ? ([
              ["Cotas para a renda alvo", r.cotasParaAlvo.toLocaleString("pt-BR")],
              ["Investimento para a renda alvo", formatarReais(r.investimentoParaAlvo)],
            ] as [string, string][])
          : []),
      ]
    : [];
  return (
    <>
      <dl className="imob-fatos">
        {fatos.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd className="num">{dd}</dd>
          </div>
        ))}
      </dl>
      <GraficoLinhas
        titulo="Patrimônio e renda acumulada"
        descricao={reinvestir ? "proventos comprando novas cotas" : "proventos gastos todo mês"}
        rotulos={pontos.map((m) => `mês ${m.mes}`)}
        series={[
          { nome: "Patrimônio em cotas", cor: 1, valores: pontos.map((m) => m.patrimonio.toNumber()) },
          { nome: "Renda acumulada", cor: 3, valores: pontos.map((m) => m.rendaAcumulada.toNumber()) },
        ]}
        formatar={(v) => formatarReais(String(v))}
        formatarEixo={(v) => formatarReais(String(v), { compacto: true })}
      />
    </>
  );
}

export function SimFii() {
  const { valores, mudar } = useCampos(INICIAL);
  const { resultado: r, erro } = useCalculo(valores, calcular);
  return (
    <div className="imob-sim">
      <div className="imob-sim__campos">
        <Campos definicoes={DEFINICOES} valores={valores} mudar={mudar} />
        <Segmentado
          rotulo="Proventos"
          opcoes={[
            { valor: "nao", rotulo: "Gastar" },
            { valor: "sim", rotulo: "Reinvestir em cotas" },
          ]}
          valor={valores.reinvestir === "sim" ? "sim" : "nao"}
          aoMudar={mudar("reinvestir")}
        />
      </div>
      <div className="imob-sim__resultado">
        {erro ? <AvisoConta erro={erro} /> : null}
        {r ? <Resultado r={r} reinvestir={valores.reinvestir === "sim"} /> : null}
        <Premissas itens={r?.premissas ?? []} />
      </div>
    </div>
  );
}
