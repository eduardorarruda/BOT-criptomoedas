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
import type { OperacaoPedido, VelasPedido } from "./pedido-analise.js";
import type { Evento } from "./eventos.js";
import type { PropostaAgente } from "./proposta.js";
import type { EstadoProtecao, IdsProtecao, ResultadoOrdem } from "./corretora.js";

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
  /** Os robôs a rodar: os não pausados e os pausados com posição aberta (o stop segue vigiado). */
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
  /**
   * Sobe o stop efetivo gravado na compra (stop móvel, empate); nunca desce. A posição
   * aberta segue com ele depois de um reinício.
   */
  subirStop(decisaoId: string, stop: Valor): Promise<void>;
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

/** PENDENTE: reservada antes do envio; se o motor caiu no meio, pode ter entrado ou não. */
export type EstadoProtecaoGravada = "PENDENTE" | EstadoProtecao;

/** A proteção (stop-limit ou OCO) que o motor vai deixar na corretora para a posição aberta. */
export interface NovaProtecao {
  readonly roboId: string;
  /** A compra que abriu a posição protegida. */
  readonly decisaoId: string;
  readonly simbolo: string;
  readonly ids: IdsProtecao;
  readonly quantidade: Valor;
  readonly stop: Valor;
  readonly limite: Valor;
  readonly alvo?: Valor;
}

export interface ProtecaoGravada extends NovaProtecao {
  readonly estado: EstadoProtecaoGravada;
  readonly idCorretora: string | null;
  readonly motivo?: string;
  readonly criadaEm: number;
  readonly atualizadaEm: number;
}

/** Uma perna da proteção executou (no todo ou em parte): é a venda que fecha a posição. */
export interface SaidaProtecao {
  /** A decisão de venda para o diário (estado "executada"); só é gravada na primeira vez. */
  readonly decisao: NovaDecisao;
  /** A perna como a corretora a devolveu: o idCliente dela, o estado e as execuções. */
  readonly ordem: ResultadoOrdem;
  readonly quantidade: Valor;
}

/**
 * Proteções na corretora, duráveis: sobrevivem ao reinício para o motor conferir o
 * livro contra o banco. No máximo uma viva (PENDENTE ou ATIVA) por robô.
 */
export interface PortaProtecoes {
  /** Grava a intenção ANTES de enviar. "ja_existe": já há uma viva para o robô, ou os ids já foram usados. */
  reservar(p: NovaProtecao): Promise<"nova" | "ja_existe">;
  /** A proteção viva (PENDENTE ou ATIVA) do robô. */
  viva(roboId: string): Promise<ProtecaoGravada | null>;
  /** A mais recente, viva ou não (a tela mostra o estado da última). */
  ultima(roboId: string): Promise<ProtecaoGravada | null>;
  atualizar(
    idLista: string,
    estado: EstadoProtecaoGravada,
    extra?: { readonly idCorretora?: string | null; readonly motivo?: string },
  ): Promise<void>;
  /**
   * Grava o que uma perna executou como a venda de saída: a decisão no diário (só na
   * primeira vez para a perna), a ordem e as execuções (reconcluir não duplica).
   */
  registrarSaida(idLista: string, saida: SaidaProtecao): Promise<{ decisaoId: string; nova: boolean }>;
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
  /** Como a operação termina (stop, regra de saída, tempo) e quanto custa (taxas, deslizamento). */
  readonly operacao?: OperacaoPedido;
  /** Máximas, mínimas, volumes e instantes das velas, alinhados com `fechamentos`. */
  readonly velas?: VelasPedido;
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
