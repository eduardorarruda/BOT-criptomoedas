import {
  ganhoCapitalImovel,
  type ResultadoGanhoCapital,
  ISENCOES_GANHO_CAPITAL_IMOVEL,
  TABELA_GANHO_CAPITAL_PF,
} from "@zentrade/financas";
import { CampoTexto } from "../../../componentes/Campo";
import { Segmentado } from "../../../componentes/Segmentado";
import { Explicacao, Premissas } from "../componentes";
import { formatarReais, formatarTaxa } from "../formato";
import { AvisoConta, Campos, reais, useCalculo, useCampos } from "./comum";

/**
 * Imposto sobre o ganho de capital na venda de um imóvel (pessoa física). Estimativa:
 * o cálculo oficial é o do GCAP da Receita. Isenções entram como declaração sua.
 */
const INICIAL = {
  venda: "800.000",
  corretagem: "40.000",
  custo: "500.000",
  benfeitorias: "60.000",
  aquisicao: "2018-01-10",
  dataVenda: "2026-10-10",
  reinvestido: "",
  unico: "nao",
  fatores: "sim",
};
type Valores = typeof INICIAL;

const DEFINICOES = [
  ["venda", "Valor de venda", "R$"],
  ["corretagem", "Corretagem paga por você", "R$"],
  ["custo", "Custo de aquisição", "R$", "Preço de compra + ITBI + escritura e registro."],
  ["benfeitorias", "Reformas e benfeitorias comprovadas", "R$"],
  [
    "reinvestido",
    "Aplicado em outro residencial em até 180 dias",
    "R$",
    "Declaração sua; deixe vazio se não houver.",
  ],
] as const;

function calcular(v: Valores) {
  return ganhoCapitalImovel({
    valorVenda: reais(v.venda, "Valor de venda"),
    custosVenda: reais(v.corretagem, "Corretagem", true),
    custoAquisicao: reais(v.custo, "Custo de aquisição"),
    benfeitorias: reais(v.benfeitorias, "Benfeitorias", true),
    dataAquisicao: v.aquisicao,
    dataVenda: v.dataVenda,
    aplicarFatoresReducao: v.fatores === "sim",
    unicoImovel: v.unico === "sim",
    ...(v.reinvestido.trim() ? { valorReinvestido: reais(v.reinvestido, "Valor reaplicado") } : {}),
  });
}

const simNao = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
] as const;

function Reducoes({ lista }: { readonly lista: ResultadoGanhoCapital["reducoes"] }) {
  return (
    <>
      {lista.map((x) => (
        <div key={x.motivo}>
          <dt>{x.motivo}</dt>
          <dd className="num">
            −{formatarReais(x.valor)} ({formatarTaxa(x.percentual)})
          </dd>
        </div>
      ))}
    </>
  );
}

function Resultado({ r }: { readonly r: ResultadoGanhoCapital }) {
  return (
    <>
      <dl className="imob-fatos">
        <div>
          <dt>Ganho bruto</dt>
          <dd className="num">{formatarReais(r.ganhoBruto, { sinal: true })}</dd>
        </div>
        <Reducoes lista={r.reducoes} />
        <div>
          <dt>Ganho tributável</dt>
          <dd className="num">{formatarReais(r.ganhoTributavel)}</dd>
        </div>
        <div>
          <dt>Imposto estimado</dt>
          <dd className="num">{formatarReais(r.imposto)}</dd>
        </div>
        <div>
          <dt>Alíquota efetiva sobre o ganho</dt>
          <dd className="num">{formatarTaxa(r.aliquotaEfetiva)}</dd>
        </div>
      </dl>
      {r.isento ? <Explicacao>Isento: {r.motivosIsencao.join(" ")}</Explicacao> : null}
    </>
  );
}

function CamposVenda({
  valores,
  mudar,
}: {
  readonly valores: Valores;
  readonly mudar: (c: keyof Valores) => (v: string) => void;
}) {
  return (
    <div className="imob-sim__campos">
      <Campos definicoes={DEFINICOES} valores={valores} mudar={mudar} />
      <CampoTexto
        rotulo="Data da compra"
        type="date"
        value={valores.aquisicao}
        onChange={(e) => mudar("aquisicao")(e.target.value)}
      />
      <CampoTexto
        rotulo="Data da venda"
        type="date"
        value={valores.dataVenda}
        onChange={(e) => mudar("dataVenda")(e.target.value)}
      />
      <Segmentado
        rotulo="É o seu único imóvel, sem outra venda em 5 anos?"
        opcoes={simNao}
        valor={valores.unico === "sim" ? "sim" : "nao"}
        aoMudar={mudar("unico")}
      />
      <Segmentado
        rotulo="Aplicar os fatores de redução (Lei 11.196/2005)?"
        opcoes={simNao}
        valor={valores.fatores === "sim" ? "sim" : "nao"}
        aoMudar={mudar("fatores")}
      />
    </div>
  );
}

export function SimGanhoCapital() {
  const { valores, mudar } = useCampos(INICIAL);
  const { resultado: r, erro } = useCalculo(valores, calcular);
  const t = TABELA_GANHO_CAPITAL_PF;
  return (
    <div className="imob-sim">
      <CamposVenda valores={valores} mudar={mudar} />
      <div className="imob-sim__resultado">
        {erro ? <AvisoConta erro={erro} /> : null}
        {r ? <Resultado r={r} /> : null}
        <Explicacao>
          Tabela progressiva usada: 15% até R$ 5 milhões de ganho, 17,5% até R$ 10 milhões, 20% até R$ 30
          milhões e 22,5% acima. Fonte: {t.fonte}; vigente desde{" "}
          {t.vigenteDesde.split("-").reverse().join("/")}, conferida em{" "}
          {t.consultadaEm.split("-").reverse().join("/")}.
        </Explicacao>
        <Premissas
          titulo="Premissas e isenções conhecidas"
          itens={[
            ...(r?.premissas ?? []),
            ...ISENCOES_GANHO_CAPITAL_IMOVEL.map((i) => `${i.descricao} (${i.baseLegal})`),
          ]}
        />
      </div>
    </div>
  );
}
