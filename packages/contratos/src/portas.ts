import type {
  Candle,
  Estrategia,
  EstadoConta,
  Execucao,
  Lado,
  LimitesRisco,
  Posicao,
  Sinal,
  Valor,
} from "@zentrade/dominio";
import type { Intervalo, ModoRobo, Rede } from "./comum.js";
import type { EstadoDecisao } from "./dados.js";
import type { Evento } from "./eventos.js";
import type { PropostaAgente } from "./proposta.js";
import type { ResultadoOrdem } from "./corretora.js";

/** Robô pronto para rodar, já com os tipos do domínio (decimais exatos). */
export interface RoboConfig {
  readonly id: string;
  /** Dona do robô: vai no pedido ao agente (RAG e diário da pessoa). */
  readonly usuarioId: string;
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
  /** Prazo da aprovação (modo sugerir), em ms. Sem ele, o banco usa o padrão. */
  readonly expiraEm?: number;
  /**
   * Stop e alvo efetivos (em preço) da compra: o mais conservador entre a regra e o
   * agente. Gravados para a posição aberta seguir protegida depois de um reinício.
   */
  readonly protecao?: Protecao;
}

export interface Protecao {
  readonly stop: Valor;
  readonly alvo: Valor;
}

/** A compra executada mais recente do robô: quem abriu a posição que está aberta. */
export interface CompraExecutada {
  readonly decisaoId: string;
  readonly preco: Valor;
  readonly protecao?: Protecao;
}

export interface PortaDecisoes {
  registrar(decisao: NovaDecisao): Promise<string>;
  mudarEstado(id: string, estado: EstadoDecisao): Promise<void>;
  estado(id: string): Promise<EstadoDecisao | null>;
  /** Resultado realizado (líquido das duas taxas) da ida e volta, gravado na compra que a abriu. */
  registrarDesfecho(decisaoId: string, resultado: Valor, em: number): Promise<void>;
  ultimaCompraExecutada(roboId: string): Promise<CompraExecutada | null>;
}

export interface NovaOrdem {
  readonly decisaoId: string;
  readonly roboId: string;
  readonly idCliente: string;
  readonly simbolo: string;
  readonly lado: "COMPRA" | "VENDA";
  readonly quantidade: Valor;
}

/** Ordem reservada sem desfecho conhecido (PENDENTE): precisa ser conferida na corretora. */
export interface OrdemPendente {
  readonly idCliente: string;
  readonly decisaoId: string;
  readonly lado: Lado;
  readonly quantidade: Valor;
  readonly criadaEm: number;
}

export interface PortaOrdens {
  /** Grava a intenção ANTES de enviar. "ja_existe" = alguém já enviou esta ordem: não reenviar. */
  reservar(ordem: NovaOrdem): Promise<"nova" | "ja_existe">;
  /** Grava o desfecho. Chamar de novo para o mesmo idCliente atualiza, sem duplicar execução. */
  concluir(idCliente: string, resultado: ResultadoOrdem): Promise<void>;
  /** Ordens PENDENTE do robô, da mais antiga à mais nova: a reconciliação sobrevive ao reinício. */
  pendentes(roboId: string): Promise<OrdemPendente[]>;
  execucoes(roboId: string): Promise<Execucao[]>;
  contarDesde(roboId: string, desdeMs: number): Promise<number>;
  resultadoDesde(roboId: string, desdeMs: number): Promise<Valor>;
  ultimaPerdaEm(roboId: string): Promise<number | null>;
}

/** Orçamento de risco do robô na hora do pedido (moeda de cotação). */
export interface OrcamentoAnalise {
  readonly riscoPorOperacao: Valor;
  readonly exposicaoMaxima: Valor;
  readonly perdaDiariaMaxima: Valor;
  readonly exposicaoAtual: Valor;
  readonly resultadoDoDia: Valor;
}

export interface PedidoAnalise {
  readonly robo: { readonly id: string; readonly simbolo: string; readonly intervalo: Intervalo };
  readonly sinal: Sinal;
  readonly preco: Valor;
  readonly fechamentos: readonly number[];
  readonly posicao: Posicao;
  /** Dona do robô: o agente busca o RAG e o diário dela. */
  readonly usuarioId?: string;
  /** Liga os eventos "analise" do agente (passo a passo ao vivo) a esta decisão. */
  readonly analiseId?: string;
  readonly orcamento?: OrcamentoAnalise;
}

export interface RespostaAnalise {
  readonly proposta: PropostaAgente;
  readonly custoUsd: Valor;
  /**
   * O orçamento de IA da pessoa acabou: a proposta é "aguardar" com o motivo e o
   * modelo nem foi chamado. O motor trata como agente indisponível (agenteObrigatorio).
   */
  readonly semOrcamento?: boolean;
}

/** O agente de IA, visto pelo motor. Pode falhar: o motor segue sem ele (não opera). */
export interface PortaAgente {
  analisar(pedido: PedidoAnalise): Promise<RespostaAnalise>;
}

/** Candles fechados gravados para o gráfico da tela e para o backtest. */
export interface PortaCandles {
  gravar(simbolo: string, intervalo: Intervalo, candles: readonly Candle[]): Promise<void>;
}

export interface PortaEventos {
  publicar(evento: Evento): Promise<void>;
}

/** Pede aprovação humana (modo Sugerir). A resposta chega pela API e muda o estado da decisão. */
export interface PortaAprovacao {
  solicitar(decisaoId: string, resumo: string, expiraEm: number): Promise<void>;
}

/**
 * Estado da conta da dona do robô (todos os robôs dela na mesma rede) para as barreiras
 * da conta. Lido sob RLS: só enxerga os dados da própria pessoa.
 */
export interface PortaRiscoConta {
  estado(roboId: string, agora: number): Promise<EstadoConta>;
}
