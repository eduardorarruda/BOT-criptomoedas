import type {
  Corretora,
  EstadoDecisao,
  PortaAgente,
  PortaAprovacao,
  PortaCandles,
  PortaDecisoes,
  PortaEventos,
  PortaOrdens,
  PortaProtecoes,
  PortaRiscoConta,
  PortaRobos,
  Relogio,
  ResultadoOrdem,
} from "@zentrade/contratos";
import { FUSO_PADRAO, type Posicao, type Sinal, type Valor } from "@zentrade/dominio";
import type { DecisaoRegistrada } from "./diario.js";
import type { Plano } from "./plano.js";

/** O que o motor usa de um logger (pino cumpre). Nada de console.log. */
export interface Registro {
  debug(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface OpcoesNucleo {
  /** Com o agente obrigatório, agente fora do ar = decisão barrada (não opera). */
  readonly agenteObrigatorio: boolean;
  readonly expiracaoAprovacaoMs: number;
  readonly consultaAprovacaoMs: number;
  /** Candles guardados por robô; indicadores longos precisam de história (o bot antigo tinha memória curta). */
  readonly tamanhoHistorico: number;
  /**
   * Distância do preço limite abaixo do gatilho do stop na corretora, em pontos-base.
   * Larga o bastante para executar num mercado rápido; se o preço passar dela, o robô
   * cancela e vende a mercado no fechamento do minuto.
   */
  readonly stopLimiteBps: number;
  /** O fuso da instância (ZENTRADE_FUSO): onde começa o dia da perda diária. */
  readonly fuso: string;
}

export const OPCOES_PADRAO: OpcoesNucleo = {
  agenteObrigatorio: true,
  expiracaoAprovacaoMs: 5 * 60_000,
  consultaAprovacaoMs: 2_000,
  tamanhoHistorico: 500,
  stopLimiteBps: 100,
  fuso: FUSO_PADRAO,
};

/** O que o ciclo recebe do robô: o sinal da regra e o contexto em que ele saiu. */
export interface EntradaCiclo {
  readonly sinal: Sinal;
  readonly preco: Valor;
  readonly fechamentos: readonly number[];
  readonly posicao: Posicao;
  readonly em: number;
}

/** Decisão do modo sugerir esperando a pessoa. O robô segue vigiando o stop enquanto isso. */
export interface AprovacaoPendente {
  readonly registrada: DecisaoRegistrada;
  readonly plano: Plano;
  readonly entrada: EntradaCiclo;
  readonly expiraEm: number;
}

export interface ResultadoCiclo {
  readonly estado: EstadoDecisao | null;
  readonly plano?: Plano;
  readonly ordem?: ResultadoOrdem;
  readonly decisaoId?: string;
  readonly pendente?: AprovacaoPendente;
}

export interface Dependencias {
  readonly corretora: Corretora;
  readonly robos: PortaRobos;
  readonly decisoes: PortaDecisoes;
  readonly ordens: PortaOrdens;
  /**
   * Com ela, o stop e o alvo da posição ficam no livro da corretora (stop-limit/OCO) e o
   * robô vira a segunda linha de defesa. Sem ela (backtest de hoje), só o robô vigia.
   */
  readonly protecoes?: PortaProtecoes;
  readonly agente: PortaAgente;
  readonly eventos: PortaEventos;
  readonly aprovacao: PortaAprovacao;
  /** Onde gravar os candles fechados (gráfico e backtest). Sem banco, não grava. */
  readonly candles?: PortaCandles;
  /** Limites da conta (todos os robôs da pessoa na rede). Sem banco, só os do robô valem. */
  readonly riscoConta?: PortaRiscoConta;
  readonly relogio: Relogio;
  readonly registro: Registro;
  readonly dormir: (ms: number) => Promise<void>;
  readonly opcoes: OpcoesNucleo;
}
