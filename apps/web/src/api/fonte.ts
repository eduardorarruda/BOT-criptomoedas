import type {
  ConfigPublica,
  CoberturaWin,
  ConfiguracaoBacktestEntrada,
  DecisaoDTO,
  EstadoDecisao,
  EstrategiaDTO,
  Evento,
  Intervalo,
  LimitesRiscoDTO,
  ModoRobo,
  OrdemDTO,
  PensamentoAtualDTO,
  PensamentoHistoricoDTO,
  PlacarDTO,
  PosicaoDTO,
  Rede,
  RoboDTO,
} from "@zentrade/contratos/esquemas";
import type {
  Automacao,
  Backtest,
  CandleApi,
  ContaCorretora,
  Documento,
  DocumentoIngerido,
  EscopoToken,
  PontoPatrimonio,
  RegistroAoVivo,
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
export type EventoTela = Evento;
export type EstadoConexao = "conectando" | "conectado" | "reconectando" | "desligado";

export interface SegredoDoisFatores {
  /** Base32, para digitar no app autenticador. */
  readonly segredo: string;
  /** `otpauth://totp/...`, que abre direto no app (no celular). */
  readonly uri: string;
}

export interface Credenciais {
  readonly email: string;
  readonly senha: string;
  readonly codigo2fa?: string;
}
type Confirmacao = { readonly senha: string } | { readonly codigo2fa: string };

export interface FiltroDecisoes {
  readonly roboId?: string;
  readonly estado?: EstadoDecisao;
  readonly antes?: number;
  readonly limite?: number;
}

export interface FiltroPlacar {
  readonly roboId?: string;
  /** Só decisões a partir deste instante (ms). */
  readonly desde?: number;
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
  /** Sem ela, a API aplica os padrões (custos realistas, limites de um robô novo, 70/30). */
  readonly configuracao?: ConfiguracaoBacktestEntrada;
}
export interface NovaConta {
  readonly corretora: "binance";
  /** Papel não precisa de chave: só testnet e real. */
  readonly rede: Exclude<Rede, "papel">;
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
  /** Só no exemplo: abre como instalação nova (`?vazio=1`). As telas com demonstração própria seguem. */
  readonly vazio?: boolean;

  obterSessao(): Promise<Usuario | null>;
  entrar(c: Credenciais): Promise<Usuario>;
  sair(): Promise<void>;
  confirmarIdentidade(c: Confirmacao): Promise<void>;
  /** Gera o segredo do autenticador (2FA) da pessoa; pede identidade confirmada. */
  iniciarDoisFatores(): Promise<SegredoDoisFatores>;
  /** Liga o 2FA com o primeiro código do app autenticador. */
  ativarDoisFatores(codigo: string): Promise<void>;

  resumo(): Promise<Resumo>;
  patrimonio(): Promise<PontoPatrimonio[]>;
  saude(): Promise<Saude>;
  /** Sem login: contato do controlador (LGPD) e versão, para a política de privacidade. */
  configPublica(): Promise<ConfigPublica>;

  estrategias(): Promise<EstrategiaDTO[]>;
  criarEstrategia(e: NovaEstrategia): Promise<EstrategiaDTO>;
  novaVersaoEstrategia(id: string, e: NovaEstrategia): Promise<EstrategiaDTO>;

  robos(): Promise<RoboDTO[]>;
  criarRobo(r: NovoRobo): Promise<RoboDTO>;
  atualizarRobo(id: string, m: MudancaRobo): Promise<RoboDTO>;
  posicao(roboId: string): Promise<PosicaoDTO>;

  decisoes(f?: FiltroDecisoes): Promise<DecisaoDTO[]>;
  /** Uma decisão com tudo o que a tela "por dentro" mostra (cenário, condições, proposta, risco, placar). */
  decisao(id: string): Promise<DecisaoDTO>;
  aprovarDecisao(id: string): Promise<DecisaoDTO>;
  recusarDecisao(id: string): Promise<DecisaoDTO>;
  /** O placar do Claude: precisão das aprovações, vetos certos, dinheiro, calibração e limite sugerido. */
  placar(f?: FiltroPlacar): Promise<PlacarDTO>;

  /** O que cada robô pensou na última vela: cenário, condições da regra e conclusão. */
  pensamentos(): Promise<PensamentoAtualDTO[]>;
  /** O histórico curto de um robô: primeira leitura, mudanças de cenário e sinais, do mais novo ao mais velho. */
  historicoDoPensamento(roboId: string): Promise<PensamentoHistoricoDTO[]>;

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
  /** Que candles do mini índice (WIN, WIN-IBOV) estão gravados, por intervalo. */
  dadosWin(): Promise<CoberturaWin[]>;

  documentos(): Promise<Documento[]>;
  criarNota(n: NovaNota): Promise<DocumentoIngerido>;
  automacoes(): Promise<Automacao[]>;

  /** O que o robô (ou, sem id, todos os robôs da pessoa) fez há pouco, do mais antigo ao mais novo. */
  aoVivo(roboId?: string): Promise<RegistroAoVivo[]>;

  /** Assina os eventos ao vivo; devolve a função que encerra a assinatura. */
  tempoReal(o: OuvintesTempoReal): () => void;
}
