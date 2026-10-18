import {
  NOMES_CENARIOS,
  type AvaliacaoCenarios,
  type Cenario,
  type NomeCenario,
  type PropostaAgente,
} from "@zentrade/contratos/esquemas";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Info,
  MessageSquareWarning,
  ShieldCheck,
  ShieldX,
  Star,
  type LucideIcon,
} from "lucide-react";
import { formatarPercentual, formatarPorcento, sinalDe } from "../../lib/formatar";
import { Selo } from "../Selo";

/**
 * "Prévias de futuro": os três caminhos do preço que a IA pesou antes de propor, o
 * que o CÓDIGO concluiu deles (valor esperado e a regra) e o principal argumento
 * contra a própria proposta. Os nomes são do mercado: numa venda o favorável é a baixa.
 */
const NOME: Record<
  NomeCenario,
  { readonly rotulo: string; readonly extenso: string; readonly icone: LucideIcon }
> = {
  alta: { rotulo: "Alta", extenso: "cenário de alta", icone: ArrowUpRight },
  lateral: { rotulo: "Lateral", extenso: "cenário lateral", icone: ArrowRight },
  baixa: { rotulo: "Baixa", extenso: "cenário de baixa", icone: ArrowDownRight },
};

const CASAS_RESULTADO = 2;

function ordenar(cenarios: readonly Cenario[]): Cenario[] {
  return [...cenarios].sort((a, b) => NOMES_CENARIOS.indexOf(a.nome) - NOMES_CENARIOS.indexOf(b.nome));
}

/** Resultado em % com sinal (+/−) e cor por papel: o sinal já diz ganho ou perda sem a cor. */
function Resultado({ valor }: { readonly valor: number }) {
  const tom = sinalDe(String(valor));
  return (
    <span className={`num ${tom === "neutro" ? "" : tom}`.trim()}>
      {formatarPorcento(valor, { casas: CASAS_RESULTADO, sinal: true })}
    </span>
  );
}

function ItemCenario({ cenario: c, favoravel }: { readonly cenario: Cenario; readonly favoravel: boolean }) {
  const nome = NOME[c.nome];
  const Icone = nome.icone;
  const probabilidade = Math.round(c.probabilidade * 100);
  const texto = formatarPercentual(c.probabilidade, { casas: 0 });
  return (
    <li className={`cenario ${favoravel ? "cenario--favoravel" : ""}`.trim()}>
      <div className="cenario__topo">
        <h4 className="cenario__nome">
          <Icone size={16} aria-hidden="true" />
          {nome.rotulo}
        </h4>
        {favoravel ? (
          <Selo tom="marca" icone={Star}>
            Favorável à operação
          </Selo>
        ) : null}
        <span className="cenario__horizonte apagado">
          em até <span className="num">{c.horizonte}</span> {c.horizonte === 1 ? "candle" : "candles"}
        </span>
      </div>
      <div className="medidor">
        <span className="medidor__rotulo">Probabilidade</span>
        <span
          className="medidor__barra"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={probabilidade}
          aria-valuetext={texto}
          aria-label={`Probabilidade do ${nome.extenso}`}
        >
          <span style={{ width: `${probabilidade}%` }} />
        </span>
        <span className="num">{texto}</span>
      </div>
      <dl className="cenario__detalhes">
        <div>
          <dt>Confirma se</dt>
          <dd>{c.gatilho}</dd>
        </div>
        <div>
          <dt>Perde a validade se</dt>
          <dd>{c.invalidacao}</dd>
        </div>
        <div>
          <dt>Resultado estimado (líquido)</dt>
          <dd>
            <Resultado valor={c.resultadoEstimado} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

const REGRA = {
  aprovada: { tom: "ganho", icone: ShieldCheck, texto: "A regra dos cenários aprovou" },
  barrada: { tom: "atencao", icone: ShieldX, texto: "A regra dos cenários barrou a entrada" },
  informa: {
    tom: "neutro",
    icone: Info,
    texto: "A regra dos cenários só informa: a proposta não abre posição",
  },
} as const;

function Avaliacao({ avaliacao: a }: { readonly avaliacao: AvaliacaoCenarios }) {
  const regra = !a.aplicada ? REGRA.informa : a.aprovada ? REGRA.aprovada : REGRA.barrada;
  const Icone = regra.icone;
  return (
    <div className="cenarios__avaliacao">
      <dl className="decisao__numeros">
        <div>
          <dt>Valor esperado líquido</dt>
          <dd>
            <Resultado valor={a.valorEsperado} />
          </dd>
        </div>
        <div>
          <dt>Chance do favorável ({NOME[a.favoravel].rotulo.toLowerCase()})</dt>
          <dd>
            <span className="num">{formatarPercentual(a.probabilidadeFavoravel, { casas: 0 })}</span>{" "}
            <span className="apagado">
              (mínimo de <span className="num">{formatarPercentual(a.limiar, { casas: 0 })}</span>)
            </span>
          </dd>
        </div>
      </dl>
      <div className={`cenarios__regra cenarios__regra--${regra.tom}`}>
        <p>
          <Icone size={16} aria-hidden="true" />
          <strong>{regra.texto}</strong>
        </p>
        <p className="cenarios__motivo">{a.motivo}</p>
      </div>
      <p className="cenarios__nota apagado">
        Valor esperado = soma de probabilidade × resultado de cada cenário, calculada pelo código (não pela
        IA), em % do preço e já sem as taxas.
      </p>
    </div>
  );
}

export function Cenarios({ proposta: p }: { readonly proposta: PropostaAgente }) {
  const cenarios = p.cenarios ? ordenar(p.cenarios) : [];
  if (cenarios.length === 0 && !p.contraArgumento) return null;
  const favoravel = p.avaliacao?.favoravel;
  return (
    // Sem nome acessível de propósito: com vários cartões, uma "region" nomeada se repetiria
    // (landmark-unique). O h3 já marca o bloco, como nos outros blocos do cartão.
    <section className="decisao__bloco cenarios">
      <h3 className="decisao__subtitulo">Prévias de futuro (cenários)</h3>
      {cenarios.length ? (
        <ul role="list" className="cenarios__lista">
          {cenarios.map((c) => (
            <ItemCenario key={c.nome} cenario={c} favoravel={c.nome === favoravel} />
          ))}
        </ul>
      ) : null}
      {p.avaliacao ? <Avaliacao avaliacao={p.avaliacao} /> : null}
      {p.contraArgumento ? (
        <div className="cenarios__contra">
          <h4 className="cenarios__contra-titulo">
            <MessageSquareWarning size={16} aria-hidden="true" />
            Principal argumento contra
          </h4>
          <p>{p.contraArgumento}</p>
        </div>
      ) : null}
    </section>
  );
}
