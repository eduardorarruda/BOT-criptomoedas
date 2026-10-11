import type { Estrategia, Execucao, LimitesRisco, Posicao, Sinal, Valor } from "@zentrade/dominio";
import type { Intervalo, ModoRobo, Rede } from "./comum.js";
import type { EstadoDecisao } from "./dados.js";
import type { Evento } from "./eventos.js";
import type { PropostaAgente } from "./proposta.js";
import type { ResultadoOrdem } from "./corretora.js";

/** Robô pronto para rodar, já com os tipos do domínio (decimais exatos). */
export interface RoboConfig {
  readonly id: string;
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  readonly modo: ModoRobo;
  readonly rede: Rede;
  readonly estrategia: Estrategia;
  readonly limites: LimitesRisco;
  /** Quanto se aceita perder por operação se o stop for atingido (moeda de cotação). */
  readonly riscoPorOperacao: Valor;
}

export interface Relogio {
  agora(): number;
}

export interface PortaRobos {
  ativos(): Promise<RoboConfig[]>;
  /** Parada total, global ou do robô. Lido a cada decisão, nunca em cache. */
  pausado(roboId: string): Promise<boolean>;
}

export interface NovaDecisao {
  readonly roboId: string;
  readonly em: number;
  readonly sinal: Sinal;
  readonly preco: Valor;
  readonly quantidade?: Valor;
  readonly proposta?: PropostaAgente;
  readonly risco: {
    readonly aprovada: boolean;
    readonly barreiras: readonly { codigo: string; mensagem: string }[];
  };
  readonly estado: EstadoDecisao;
  readonly custoIaUsd?: Valor;
}

export interface PortaDecisoes {
  registrar(decisao: NovaDecisao): Promise<string>;
  mudarEstado(id: string, estado: EstadoDecisao): Promise<void>;
  estado(id: string): Promise<EstadoDecisao | null>;
}

export interface NovaOrdem {
  readonly decisaoId: string;
  readonly roboId: string;
  readonly idCliente: string;
  readonly simbolo: string;
  readonly lado: "COMPRA" | "VENDA";
  readonly quantidade: Valor;
}

export interface PortaOrdens {
  /** Grava a intenção ANTES de enviar. "ja_existe" = alguém já enviou esta ordem: não reenviar. */
  reservar(ordem: NovaOrdem): Promise<"nova" | "ja_existe">;
  concluir(idCliente: string, resultado: ResultadoOrdem): Promise<void>;
  execucoes(roboId: string): Promise<Execucao[]>;
  contarDesde(roboId: string, desdeMs: number): Promise<number>;
  resultadoDesde(roboId: string, desdeMs: number): Promise<Valor>;
  ultimaPerdaEm(roboId: string): Promise<number | null>;
}

export interface PedidoAnalise {
  readonly robo: { readonly id: string; readonly simbolo: string; readonly intervalo: Intervalo };
  readonly sinal: Sinal;
  readonly preco: Valor;
  readonly fechamentos: readonly number[];
  readonly posicao: Posicao;
}

export interface RespostaAnalise {
  readonly proposta: PropostaAgente;
  readonly custoUsd: Valor;
}

/** O agente de IA, visto pelo motor. Pode falhar: o motor segue sem ele (não opera). */
export interface PortaAgente {
  analisar(pedido: PedidoAnalise): Promise<RespostaAnalise>;
}

export interface PortaEventos {
  publicar(evento: Evento): Promise<void>;
}

/** Pede aprovação humana (modo Sugerir). A resposta chega pela API e muda o estado da decisão. */
export interface PortaAprovacao {
  solicitar(decisaoId: string, resumo: string, expiraEm: number): Promise<void>;
}
