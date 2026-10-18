import { dec, type Valor } from "./dinheiro.js";
import { formatarDolar, formatarNumero } from "./formatar.js";

/**
 * Limites da CONTA: valem para a pessoa somando todos os robôs dela na mesma rede (a
 * mesma conta da corretora). Completam os limites de cada robô; nunca os substituem.
 *
 * Como os do robô, só barram COMPRA: sair de uma posição reduz risco, então nenhuma
 * barreira daqui segura uma venda — nem o stop, nem a saída pela regra.
 *
 * `null` = sem limite. Inspirado nas proteções do Freqtrade (MaxDrawdown,
 * StoplossGuard) e no "controle de perda máxima por período" das corretoras.
 */
export type EscopoSequencia = "robo" | "conta" | "ambos";

export interface LimitesConta {
  /** Perda máxima do dia (00:00 a 23:59 no fuso da instância), em US$, somando os robôs. */
  readonly perdaDiariaMaxima: Valor | null;
  /** Soma o resultado não realizado das posições abertas à perda do dia. */
  readonly incluirNaoRealizado: boolean;
  /** Exposição máxima somando as posições abertas dos robôs, em US$. */
  readonly exposicaoMaxima: Valor | null;
  /** Quantas posições podem estar abertas ao mesmo tempo, entre todos os robôs. */
  readonly posicoesAbertasMax: number | null;
  /** Queda máxima (US$) do pico do resultado acumulado dentro da janela. */
  readonly quedaMaxima: Valor | null;
  readonly quedaJanelaMs: number;
  /** StoplossGuard: N saídas com perda dentro da janela pausam as compras. */
  readonly sequenciaStopsMax: number | null;
  readonly sequenciaStopsJanelaMs: number;
  readonly sequenciaStopsEscopo: EscopoSequencia;
}

const HORA_MS = 3_600_000;

export const LIMITES_CONTA_LIVRES: LimitesConta = Object.freeze({
  perdaDiariaMaxima: null,
  incluirNaoRealizado: false,
  exposicaoMaxima: null,
  posicoesAbertasMax: null,
  quedaMaxima: null,
  quedaJanelaMs: 72 * HORA_MS,
  sequenciaStopsMax: null,
  sequenciaStopsJanelaMs: 24 * HORA_MS,
  sequenciaStopsEscopo: "ambos",
});

/** Efeito de uma execução no resultado realizado da conta (venda: ganho/perda; compra: a taxa). */
export interface ResultadoRealizado {
  readonly em: number;
  readonly delta: Valor;
}

/** Saldo da corretora abaixo do que os robôs registram (ver reconciliacao.ts). */
export interface DivergenciaAberta {
  readonly ativo: string;
  readonly falta: Valor;
  readonly detectadaEm: number;
}

/** O estado da conta na hora da decisão, lido sob RLS (só os dados da dona do robô). */
export interface EstadoConta {
  readonly limites: LimitesConta;
  readonly agora: number;
  /** Resultado realizado desde a meia-noite (fuso da instância), somando os robôs da conta. */
  readonly realizadoDoDia: Valor;
  /** Resultado não realizado agora das posições abertas (preço atual − preço médio). */
  readonly naoRealizado: Valor;
  readonly exposicao: Valor;
  readonly posicoesAbertas: number;
  /** O robô que quer comprar já tem posição: a compra não abre posição nova. */
  readonly roboTemPosicao: boolean;
  /** Resultados realizados da conta dentro da maior janela (queda do pico). */
  readonly resultados: readonly ResultadoRealizado[];
  /** Instantes das saídas com perda (stops e regras de saída que perderam). */
  readonly saidasComPerdaConta: readonly number[];
  readonly saidasComPerdaRobo: readonly number[];
  /** A pessoa liberou as pausas à mão: pico e perdas anteriores a isto não contam. */
  readonly liberadaEm: number | null;
  /** Divergências abertas com a corretora no ativo do robô. */
  readonly divergencias: readonly DivergenciaAberta[];
  /** Não deu para ler o estado: compras ficam paradas (vendas seguem). */
  readonly indisponivel?: string;
}

export type CodigoBarreiraConta =
  | "conta_indisponivel"
  | "conta_perda_diaria"
  | "conta_exposicao"
  | "conta_posicoes"
  | "conta_queda"
  | "sequencia_stops"
  | "sequencia_stops_robo"
  | "divergencia_saldo";

export interface BarreiraConta {
  readonly codigo: CodigoBarreiraConta;
  readonly mensagem: string;
}

/** O que a compra acrescenta: quantidade × preço de referência. */
export interface CompraConta {
  readonly quantidade: Valor;
  readonly precoReferencia: Valor;
}

/** Estado que só barra compras: usado quando o estado da conta não pôde ser lido. */
export function contaIndisponivel(agora: number, motivo: string): EstadoConta {
  return {
    limites: LIMITES_CONTA_LIVRES,
    agora,
    realizadoDoDia: dec(0),
    naoRealizado: dec(0),
    exposicao: dec(0),
    posicoesAbertas: 0,
    roboTemPosicao: false,
    resultados: [],
    saidasComPerdaConta: [],
    saidasComPerdaRobo: [],
    liberadaEm: null,
    divergencias: [],
    indisponivel: motivo,
  };
}

/** "16 h", "1 h 30 min", "45 min": quanto falta, como uma pessoa diria. */
export function formatarDuracao(ms: number): string {
  const minutosTotais = Math.max(1, Math.ceil(ms / 60_000));
  const horas = Math.floor(minutosTotais / 60);
  const minutos = minutosTotais % 60;
  if (horas === 0) return `${minutos} min`;
  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`;
}

/** Perda (ou ganho) do dia da conta: realizado, mais o não realizado se configurado. */
export function perdaDoDiaConta(e: EstadoConta): Valor {
  return e.limites.incluirNaoRealizado ? e.realizadoDoDia.plus(e.naoRealizado) : e.realizadoDoDia;
}

export interface QuedaDoPico {
  /** Maior resultado acumulado dentro da janela (começa em zero). */
  readonly pico: Valor;
  /** Instante do pico; `null` quando o pico é o próprio início da janela. */
  readonly picoEm: number | null;
  readonly atual: Valor;
  /** Pico − atual, nunca negativa. */
  readonly queda: Valor;
}

/**
 * Drawdown da conta: acumula os resultados realizados a partir de `desde` (partindo de
 * zero), guarda o pico e mede a distância até o ponto atual. O não realizado entra só
 * no ponto atual — como no MaxDrawdown do Freqtrade, o pico vem de operações fechadas.
 */
export function quedaDoPico(
  resultados: readonly ResultadoRealizado[],
  desde: number,
  naoRealizadoAgora: Valor,
): QuedaDoPico {
  let acumulado = dec(0);
  let pico = dec(0);
  let picoEm: number | null = null;
  for (const r of [...resultados].filter((x) => x.em >= desde).sort((a, b) => a.em - b.em)) {
    acumulado = acumulado.plus(r.delta);
    if (acumulado.gt(pico)) {
      pico = acumulado;
      picoEm = r.em;
    }
  }
  const atual = acumulado.plus(naoRealizadoAgora);
  const queda = pico.minus(atual);
  return { pico, picoEm, atual, queda: queda.isNegative() ? dec(0) : queda };
}

/**
 * StoplossGuard: com `max` saídas com perda dentro da janela, as compras param até a
 * mais antiga delas (das `max` mais recentes) sair da janela. Devolve quando libera, ou
 * `null` se não há pausa. Perdas antes de `desde` (liberação manual) não contam.
 */
export function fimDaSequencia(
  perdas: readonly number[],
  max: number,
  janelaMs: number,
  agora: number,
  desde: number | null,
): number | null {
  const inicio = Math.max(agora - janelaMs, desde ?? -Infinity);
  const recentes = perdas.filter((em) => em > inicio && em <= agora).sort((a, b) => a - b);
  if (max < 1 || recentes.length < max) return null;
  const marco = recentes[recentes.length - max];
  return marco === undefined ? null : marco + janelaMs;
}

/** Início efetivo da janela: a liberação manual corta tudo o que veio antes. */
const inicioDaJanela = (e: EstadoConta, janelaMs: number): number =>
  Math.max(e.agora - janelaMs, e.liberadaEm ?? -Infinity);

function barreiraDaQueda(e: EstadoConta): BarreiraConta | null {
  const { quedaMaxima, quedaJanelaMs } = e.limites;
  if (!quedaMaxima) return null;
  const inicio = inicioDaJanela(e, quedaJanelaMs);
  const q = quedaDoPico(e.resultados, inicio, e.limites.incluirNaoRealizado ? e.naoRealizado : dec(0));
  if (q.queda.lt(quedaMaxima)) return null;
  const primeiro = e.resultados.filter((r) => r.em >= inicio).reduce((m, r) => Math.min(m, r.em), e.agora);
  const libera = (q.picoEm ?? primeiro) + quedaJanelaMs;
  return {
    codigo: "conta_queda",
    mensagem: `A conta caiu ${formatarDolar(q.queda)} desde o pico das últimas ${formatarDuracao(quedaJanelaMs)}; o limite é ${formatarDolar(quedaMaxima)}. Compras pausadas por cerca de ${formatarDuracao(libera - e.agora)} (quando o pico sair da janela) ou até você liberar na tela de Risco.`,
  };
}

function barreiraDaSequencia(
  e: EstadoConta,
  perdas: readonly number[],
  codigo: "sequencia_stops" | "sequencia_stops_robo",
): BarreiraConta | null {
  const { sequenciaStopsMax: max, sequenciaStopsJanelaMs: janela } = e.limites;
  if (max === null) return null;
  const fim = fimDaSequencia(perdas, max, janela, e.agora, e.liberadaEm);
  if (fim === null) return null;
  const onde = codigo === "sequencia_stops" ? "somando os robôs da conta" : "neste robô";
  return {
    codigo,
    mensagem: `${max} saídas com perda nas últimas ${formatarDuracao(janela)} (${onde}). Compras pausadas por ${formatarDuracao(fim - e.agora)} ou até você liberar na tela de Risco.`,
  };
}

function barreirasDeSequencia(e: EstadoConta): BarreiraConta[] {
  const escopo = e.limites.sequenciaStopsEscopo;
  const conta = escopo !== "robo" ? barreiraDaSequencia(e, e.saidasComPerdaConta, "sequencia_stops") : null;
  const robo =
    escopo !== "conta" ? barreiraDaSequencia(e, e.saidasComPerdaRobo, "sequencia_stops_robo") : null;
  return [conta, robo].filter((b): b is BarreiraConta => b !== null);
}

function barreirasDeLimites(p: CompraConta, e: EstadoConta): BarreiraConta[] {
  const l = e.limites;
  const b: BarreiraConta[] = [];
  const doDia = perdaDoDiaConta(e);
  if (l.perdaDiariaMaxima && doDia.lte(l.perdaDiariaMaxima.neg()))
    b.push({
      codigo: "conta_perda_diaria",
      mensagem: `A perda do dia na conta (${formatarDolar(doDia.neg())}, somando os robôs${l.incluirNaoRealizado ? " e o não realizado" : ""}) chegou ao limite de ${formatarDolar(l.perdaDiariaMaxima)}. Compras voltam quando o dia virar, à meia-noite.`,
    });
  const exposicao = e.exposicao.plus(p.quantidade.times(p.precoReferencia));
  if (l.exposicaoMaxima && exposicao.gt(l.exposicaoMaxima))
    b.push({
      codigo: "conta_exposicao",
      mensagem: `Com esta compra a exposição da conta iria a ${formatarDolar(exposicao)}; o máximo somando os robôs é ${formatarDolar(l.exposicaoMaxima)}.`,
    });
  if (l.posicoesAbertasMax !== null && !e.roboTemPosicao && e.posicoesAbertas >= l.posicoesAbertasMax)
    b.push({
      codigo: "conta_posicoes",
      mensagem: `Já há ${e.posicoesAbertas} posições abertas entre os robôs; o máximo é ${l.posicoesAbertasMax}. Esta compra abriria mais uma.`,
    });
  return b;
}

function barreirasDeDivergencia(e: EstadoConta): BarreiraConta[] {
  return e.divergencias.map((d) => ({
    codigo: "divergencia_saldo" as const,
    mensagem: `O saldo de ${d.ativo} na corretora está ${formatarNumero(d.falta)} abaixo do que os robôs registram. Compras com ${d.ativo} ficam paradas até a divergência ser resolvida na tela de Risco.`,
  }));
}

/**
 * As barreiras da conta para uma COMPRA. Quem chama (avaliarRisco) só passa compras:
 * vendas nunca chegam aqui.
 */
export function barreirasDaConta(p: CompraConta, e: EstadoConta): BarreiraConta[] {
  if (e.indisponivel !== undefined)
    return [
      {
        codigo: "conta_indisponivel",
        mensagem: `Não deu para ler o estado da conta (${e.indisponivel}). Sem ele, compras ficam paradas; vendas e stops seguem.`,
      },
    ];
  const queda = barreiraDaQueda(e);
  return [
    ...barreirasDeLimites(p, e),
    ...(queda ? [queda] : []),
    ...barreirasDeSequencia(e),
    ...barreirasDeDivergencia(e),
  ];
}
