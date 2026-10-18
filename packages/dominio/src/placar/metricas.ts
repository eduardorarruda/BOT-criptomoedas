import { dec, type Valor } from "../dinheiro.js";
import { MERCADOS, type Mercado } from "../mercados/mercado.js";
import { brier, intervaloWilson, type Intervalo } from "./estatistica.js";

/**
 * O placar do Claude é um problema de meta-rotulagem (López de Prado): as regras dão o
 * sinal; o Claude decide se pega. Então a pergunta não é "quantas vezes ele acertou",
 * e sim:
 *   - das entradas que ele aprovou, quantas deram lucro líquido (precisão)?
 *   - dos sinais que ele vetou, quantos teriam dado prejuízo (vetos certos)?
 *   - em dinheiro, as aprovações dele foram melhores que aprovar tudo?
 *   - a confiança que ele diz bate com o que acontece (calibração)?
 * "% de acerto" sozinho engana: 90% de acertos de +1 com um erro de −20 perde dinheiro.
 * Por isso o placar mostra também payoff, expectativa e o acerto necessário para empatar.
 *
 * Rótulos: aprovação certa = resultado líquido > 0; veto certo = o contrafactual
 * (o que a entrada vetada teria dado) ≤ 0. Pendentes não entram nas contas.
 */
export type VeredictoClaude = "aprovou" | "vetou";

export interface DecisaoPlacar {
  readonly id: string;
  readonly em: number;
  readonly claude: VeredictoClaude;
  /** A confiança da proposta (0 a 1) na própria escolha. */
  readonly confianca: number;
  /** `real`: a posição executada fechou; `contrafactual`: a simulação da entrada. */
  readonly fonte: "real" | "contrafactual";
  /** Resultado líquido na moeda do mercado; `null` enquanto pendente. */
  readonly resultado: Valor | null;
  /** Resultado ÷ valor da entrada; `null` enquanto pendente. */
  readonly retorno: number | null;
  /** Moeda do resultado (USDT, BRL...). */
  readonly moeda: string;
  readonly roboId: string;
  readonly roboNome: string;
  readonly estrategiaId: string;
  readonly estrategiaNome: string;
  readonly mercado: Mercado;
}

export interface Proporcao {
  readonly acertos: number;
  readonly total: number;
  readonly taxa: number | null;
  /** Wilson 95%; `null` sem casos. */
  readonly intervalo: Intervalo | null;
}

export interface DinheiroPlacar {
  /** Soma dos resultados das entradas aprovadas. */
  readonly aprovadas: Valor;
  /** Soma de todas as entradas (aprovadas e vetadas): como se o Claude aprovasse tudo. */
  readonly seAprovasseTudo: Valor;
  /** Aprovadas − aprovar tudo: o que o Claude agregou (positivo) ou tirou (negativo). */
  readonly agregado: Valor;
  /** Prejuízo que os vetos certos evitaram (positivo). */
  readonly perdasEvitadas: Valor;
  /** Lucro que os vetos errados deixaram passar (positivo). */
  readonly ganhosPerdidos: Valor;
}

export interface PayoffPlacar {
  readonly ganhoMedio: Valor;
  /** Em módulo. */
  readonly perdaMedia: Valor;
  /** Ganho médio ÷ perda média; `null` sem perdas. */
  readonly payoff: number | null;
  /** Resultado médio por aprovação. */
  readonly expectativa: Valor;
  /** A precisão que empata com esse payoff: perda média ÷ (ganho médio + perda média). */
  readonly acertoNecessario: number | null;
}

export interface FaixaCalibracao {
  readonly de: number;
  readonly ate: number;
  readonly decisoes: number;
  readonly confiancaMedia: number | null;
  /** Acerto observado na faixa. */
  readonly acerto: number | null;
}

export interface LinhaLimite {
  readonly limite: number;
  readonly aprovacoes: number;
  readonly acertos: number;
  readonly precisao: number | null;
  /** Soma em dinheiro; `null` com moedas misturadas. */
  readonly resultado: Valor | null;
  /** Soma dos retornos (comparável entre mercados). */
  readonly retorno: number;
}

export interface LimiteSugerido extends LinhaLimite {
  readonly precisao: number;
  readonly intervalo: Intervalo;
  /** Menos de 30 aprovações acima do limite: a sugestão ainda é frágil. */
  readonly poucasAmostras: boolean;
}

export interface MetricasPlacar {
  readonly decisoes: number;
  readonly avaliadas: number;
  readonly pendentes: number;
  /** `null` quando o grupo mistura moedas (aí o dinheiro não é somado). */
  readonly moeda: string | null;
  /** Precisão das aprovações. */
  readonly aprovacoes: Proporcao;
  /** Vetos certos. */
  readonly vetos: Proporcao;
  readonly acuracia: Proporcao;
  readonly dinheiro: DinheiroPlacar | null;
  readonly payoff: PayoffPlacar | null;
  readonly calibracao: { readonly brier: number | null; readonly faixas: readonly FaixaCalibracao[] };
  /** Se só valessem as aprovações com confiança ≥ limite (de 0,50 a 0,95). */
  readonly limites: readonly LinhaLimite[];
  /** O limite de maior resultado com precisão ≥ 80%; `null` se nenhum chega lá. */
  readonly limite: LimiteSugerido | null;
  /** Pelo menos 30 decisões avaliadas. */
  readonly confiavel: boolean;
  readonly aviso: string | null;
}

/** A meta: no mínimo 80% das aprovações com lucro líquido. */
export const PRECISAO_META = 0.8;
/** Abaixo disto, qualquer porcentagem ainda muda muito com a próxima decisão. */
export const AMOSTRA_MINIMA = 30;

const FAIXAS: readonly (readonly [number, number])[] = [
  [0, 0.5],
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1],
];
const LIMITES = Array.from({ length: 10 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);

export const acertou = (claude: VeredictoClaude, resultado: Valor): boolean =>
  claude === "aprovou" ? resultado.gt(0) : resultado.lte(0);

interface Avaliada extends DecisaoPlacar {
  readonly resultado: Valor;
  readonly retorno: number;
  readonly certa: boolean;
}

const soma = (lista: readonly Avaliada[]): Valor => lista.reduce((s, d) => s.plus(d.resultado), dec(0));
const media = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;

function proporcao(lista: readonly Avaliada[]): Proporcao {
  const acertos = lista.filter((d) => d.certa).length;
  const total = lista.length;
  return total === 0
    ? { acertos, total, taxa: null, intervalo: null }
    : { acertos, total, taxa: acertos / total, intervalo: intervaloWilson(acertos, total) };
}

function dinheiro(avaliadas: readonly Avaliada[], aprovadas: readonly Avaliada[]): DinheiroPlacar {
  const vetadas = avaliadas.filter((d) => d.claude === "vetou");
  const aprovado = soma(aprovadas);
  const tudo = soma(avaliadas);
  return {
    aprovadas: aprovado,
    seAprovasseTudo: tudo,
    agregado: aprovado.minus(tudo),
    perdasEvitadas: soma(vetadas.filter((d) => d.certa)).neg(),
    ganhosPerdidos: soma(vetadas.filter((d) => !d.certa)),
  };
}

function payoff(aprovadas: readonly Avaliada[]): PayoffPlacar | null {
  if (aprovadas.length === 0) return null;
  const ganhos = aprovadas.filter((d) => d.resultado.gt(0));
  const perdas = aprovadas.filter((d) => !d.resultado.gt(0));
  const ganhoMedio = ganhos.length === 0 ? dec(0) : soma(ganhos).div(ganhos.length);
  const perdaMedia = perdas.length === 0 ? dec(0) : soma(perdas).neg().div(perdas.length);
  const ambos = ganhoMedio.plus(perdaMedia);
  return {
    ganhoMedio,
    perdaMedia,
    payoff: perdaMedia.isZero() ? null : ganhoMedio.div(perdaMedia).toNumber(),
    expectativa: soma(aprovadas).div(aprovadas.length),
    acertoNecessario: ambos.isZero() ? null : perdaMedia.div(ambos).toNumber(),
  };
}

function faixas(avaliadas: readonly Avaliada[]): FaixaCalibracao[] {
  return FAIXAS.map(([de, ate]) => {
    const ultima = ate === 1;
    const dentro = avaliadas.filter(
      (d) => d.confianca >= de && (d.confianca < ate || (ultima && d.confianca <= 1)),
    );
    return {
      de,
      ate,
      decisoes: dentro.length,
      confiancaMedia: media(dentro.map((d) => d.confianca)),
      acerto: media(dentro.map((d) => (d.certa ? 1 : 0))),
    };
  });
}

function linhasLimite(aprovadas: readonly Avaliada[], comDinheiro: boolean): LinhaLimite[] {
  return LIMITES.map((limite) => {
    const acima = aprovadas.filter((d) => d.confianca >= limite);
    const acertos = acima.filter((d) => d.certa).length;
    return {
      limite,
      aprovacoes: acima.length,
      acertos,
      precisao: acima.length === 0 ? null : acertos / acima.length,
      resultado: comDinheiro ? soma(acima) : null,
      retorno: acima.reduce((s, d) => s + d.retorno, 0),
    };
  });
}

/** O critério do limite: dinheiro quando há uma moeda só; senão, a soma dos retornos. */
const ganhoDe = (l: LinhaLimite): number => l.resultado?.toNumber() ?? l.retorno;

function sugerir(linhas: readonly LinhaLimite[]): LimiteSugerido | null {
  const boas = linhas.filter((l) => l.aprovacoes > 0 && (l.precisao ?? 0) >= PRECISAO_META);
  const melhor = boas.reduce<LinhaLimite | null>(
    (m, l) => (m === null || ganhoDe(l) > ganhoDe(m) ? l : m),
    null,
  );
  if (!melhor) return null;
  return {
    ...melhor,
    precisao: melhor.acertos / melhor.aprovacoes,
    intervalo: intervaloWilson(melhor.acertos, melhor.aprovacoes),
    poucasAmostras: melhor.aprovacoes < AMOSTRA_MINIMA,
  };
}

function aviso(avaliadas: number): string | null {
  if (avaliadas === 0)
    return "Ainda não há decisões avaliadas: o placar aparece quando os sinais tiverem desfecho.";
  if (avaliadas < AMOSTRA_MINIMA)
    return `Só ${avaliadas} decisões avaliadas: com menos de ${AMOSTRA_MINIMA}, as porcentagens ainda mudam muito a cada decisão (veja o intervalo).`;
  return null;
}

function validar(d: DecisaoPlacar): void {
  if (!(d.confianca >= 0 && d.confianca <= 1))
    throw new RangeError(`a confiança da decisão ${d.id} precisa estar entre 0 e 1`);
}

/** As métricas de um conjunto de decisões do Claude. */
export function metricasDoPlacar(decisoes: readonly DecisaoPlacar[]): MetricasPlacar {
  decisoes.forEach(validar);
  const avaliadas: Avaliada[] = decisoes.flatMap((d) =>
    d.resultado === null || d.retorno === null
      ? []
      : [{ ...d, resultado: d.resultado, retorno: d.retorno, certa: acertou(d.claude, d.resultado) }],
  );
  const aprovadas = avaliadas.filter((d) => d.claude === "aprovou");
  // A moeda vem das avaliadas: as pendentes ainda não têm dinheiro para somar.
  const moedas = new Set(avaliadas.map((d) => d.moeda));
  const moeda = moedas.size === 1 ? (avaliadas[0] as Avaliada).moeda : null;
  const comDinheiro = moeda !== null && avaliadas.length > 0;
  const limites = linhasLimite(aprovadas, moeda !== null);
  return {
    decisoes: decisoes.length,
    avaliadas: avaliadas.length,
    pendentes: decisoes.length - avaliadas.length,
    moeda,
    aprovacoes: proporcao(aprovadas),
    vetos: proporcao(avaliadas.filter((d) => d.claude === "vetou")),
    acuracia: proporcao(avaliadas),
    dinheiro: comDinheiro ? dinheiro(avaliadas, aprovadas) : null,
    payoff: moeda !== null ? payoff(aprovadas) : null,
    calibracao: {
      brier: brier(avaliadas.map((d) => ({ confianca: d.confianca, acertou: d.certa }))),
      faixas: faixas(avaliadas),
    },
    limites,
    limite: sugerir(limites),
    confiavel: avaliadas.length >= AMOSTRA_MINIMA,
    aviso: aviso(avaliadas.length),
  };
}

export interface GrupoPlacar {
  readonly chave: string;
  readonly nome: string;
  readonly metricas: MetricasPlacar;
}

export interface Placar {
  readonly total: MetricasPlacar;
  readonly porRobo: readonly GrupoPlacar[];
  readonly porEstrategia: readonly GrupoPlacar[];
  readonly porMercado: readonly GrupoPlacar[];
}

/** Agrupa na ordem em que cada chave aparece pela primeira vez. */
function agrupar(
  decisoes: readonly DecisaoPlacar[],
  chave: (d: DecisaoPlacar) => string,
  nome: (d: DecisaoPlacar) => string,
): GrupoPlacar[] {
  const grupos = new Map<string, { nome: string; lista: DecisaoPlacar[] }>();
  for (const d of decisoes) {
    const k = chave(d);
    const g = grupos.get(k);
    if (g) g.lista.push(d);
    else grupos.set(k, { nome: nome(d), lista: [d] });
  }
  return [...grupos.entries()].map(([k, g]) => ({
    chave: k,
    nome: g.nome,
    metricas: metricasDoPlacar(g.lista),
  }));
}

/** O placar inteiro: total, por robô, por estratégia e por mercado. */
export function calcularPlacar(decisoes: readonly DecisaoPlacar[]): Placar {
  return {
    total: metricasDoPlacar(decisoes),
    porRobo: agrupar(
      decisoes,
      (d) => d.roboId,
      (d) => d.roboNome,
    ),
    porEstrategia: agrupar(
      decisoes,
      (d) => d.estrategiaId,
      (d) => d.estrategiaNome,
    ),
    porMercado: agrupar(
      decisoes,
      (d) => d.mercado,
      (d) => MERCADOS[d.mercado].nome,
    ),
  };
}
