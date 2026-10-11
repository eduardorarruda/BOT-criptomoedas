import type {
  DecisaoDTO,
  EstadoDecisao,
  EstrategiaDTO,
  Evento,
  Intervalo,
  LimitesRiscoDTO,
  ModoRobo,
  OrdemDTO,
  PosicaoDTO,
  Rede,
  RoboDTO,
} from "@zentrade/contratos";
import type {
  Automacao,
  Backtest,
  CandleApi,
  ContaCorretora,
  Documento,
  EscopoToken,
  EventoAnalise,
  PontoPatrimonio,
  Resumo,
  Saude,
  TokenApi,
  TokenCriado,
  Usuario,
} from "./esquemas";

/**
 * De onde a tela tira os dados. Há duas implementações: a API de verdade
 * (`criarFonteApi`) e o modo de demonstração (`criarFonteDemo`), que roda tudo no
 * navegador. As telas só conhecem esta interface.
 */
export type EventoTela = Evento | EventoAnalise;
export type EstadoConexao = "conectando" | "conectado" | "reconectando" | "desligado";

export interface Credenciais {
  readonly email: string;
  readonly senha: string;
  readonly codigo2fa?: string;
}
export type Confirmacao = { readonly senha: string } | { readonly codigo2fa: string };

export interface FiltroDecisoes {
  readonly roboId?: string;
  readonly estado?: EstadoDecisao;
  readonly antes?: number;
  readonly limite?: number;
}

export type NovaEstrategia = Omit<EstrategiaDTO, "id" | "versao">;
export type NovoRobo = Omit<RoboDTO, "id" | "criadoEm" | "pausado" | "modo">;
export interface MudancaRobo {
  readonly nome?: string;
  readonly modo?: ModoRobo;
  readonly limites?: LimitesRiscoDTO;
  readonly pausado?: boolean;
}
export interface PedidoBacktest {
  readonly estrategiaId: string;
  readonly versao: number;
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  readonly inicio: number;
  readonly fim: number;
}
export interface NovaConta {
  readonly corretora: "binance";
  readonly rede: Rede;
  readonly apiKey: string;
  readonly apiSecret: string;
}
export interface NovaNota {
  readonly titulo: string;
  readonly texto: string;
}

export interface OuvintesTempoReal {
  readonly aoEvento: (e: EventoTela) => void;
  readonly aoEstado: (estado: EstadoConexao) => void;
}

export interface Fonte {
  readonly demo: boolean;

  obterSessao(): Promise<Usuario | null>;
  entrar(c: Credenciais): Promise<Usuario>;
  sair(): Promise<void>;
  confirmarIdentidade(c: Confirmacao): Promise<void>;

  resumo(): Promise<Resumo>;
  patrimonio(): Promise<PontoPatrimonio[]>;
  saude(): Promise<Saude>;

  estrategias(): Promise<EstrategiaDTO[]>;
  criarEstrategia(e: NovaEstrategia): Promise<EstrategiaDTO>;
  novaVersaoEstrategia(id: string, e: NovaEstrategia): Promise<EstrategiaDTO>;

  robos(): Promise<RoboDTO[]>;
  criarRobo(r: NovoRobo): Promise<RoboDTO>;
  atualizarRobo(id: string, m: MudancaRobo): Promise<RoboDTO>;
  posicao(roboId: string): Promise<PosicaoDTO>;

  decisoes(f?: FiltroDecisoes): Promise<DecisaoDTO[]>;
  aprovarDecisao(id: string): Promise<DecisaoDTO>;
  recusarDecisao(id: string): Promise<DecisaoDTO>;

  ordens(roboId?: string): Promise<OrdemDTO[]>;
  candles(simbolo: string, intervalo: Intervalo): Promise<CandleApi[]>;
  definirParadaTotal(ligada: boolean): Promise<boolean>;

  contas(): Promise<ContaCorretora[]>;
  criarConta(c: NovaConta): Promise<ContaCorretora>;
  removerConta(id: string): Promise<void>;

  tokens(): Promise<TokenApi[]>;
  criarToken(nome: string, escopo: EscopoToken): Promise<TokenCriado>;
  revogarToken(id: string): Promise<void>;

  backtests(): Promise<Backtest[]>;
  criarBacktest(p: PedidoBacktest): Promise<Backtest>;
  backtest(id: string): Promise<Backtest>;

  documentos(): Promise<Documento[]>;
  criarNota(n: NovaNota): Promise<Documento>;
  automacoes(): Promise<Automacao[]>;

  /** Assina os eventos ao vivo; devolve a função que encerra a assinatura. */
  tempoReal(o: OuvintesTempoReal): () => void;
}
