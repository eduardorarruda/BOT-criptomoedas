import type {
  Corretora,
  PortaAgente,
  PortaAprovacao,
  PortaDecisoes,
  PortaEventos,
  PortaOrdens,
  PortaRobos,
  Relogio,
} from "@zentrade/contratos";

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
}

export const OPCOES_PADRAO: OpcoesNucleo = {
  agenteObrigatorio: true,
  expiracaoAprovacaoMs: 5 * 60_000,
  consultaAprovacaoMs: 2_000,
  tamanhoHistorico: 500,
};

export interface Dependencias {
  readonly corretora: Corretora;
  readonly robos: PortaRobos;
  readonly decisoes: PortaDecisoes;
  readonly ordens: PortaOrdens;
  readonly agente: PortaAgente;
  readonly eventos: PortaEventos;
  readonly aprovacao: PortaAprovacao;
  readonly relogio: Relogio;
  readonly registro: Registro;
  readonly dormir: (ms: number) => Promise<void>;
  readonly opcoes: OpcoesNucleo;
}
