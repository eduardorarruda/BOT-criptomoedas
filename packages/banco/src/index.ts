export * from "./banco.js";
export * from "./calculos.js";
export * from "./cifra.js";
export * from "./cliente.js";
export * from "./config.js";
export * from "./erros.js";
export * from "./migrar.js";
export {
  criarBancoDoAgente,
  type BancoDoAgente,
  type OpcoesBancoDoAgente,
} from "./repositorios/assistente-agente.js";
export type { NovaMensagem, RepositorioAssistente, TurnoHistorico } from "./repositorios/assistente.js";
export type {
  OrigemParaGravar,
  RepositorioConhecimentoDetalhe,
} from "./repositorios/assistente-conhecimento.js";
export type {
  Backtest,
  BacktestParaRodar,
  EstadoBacktest,
  PedidoBacktest,
  ResultadoBacktestGravado,
  TentativaBacktest,
} from "./repositorios/backtests.js";
export type { Documento, DocumentoParaGravar, Fonte, TrechoParaGravar } from "./repositorios/conhecimento.js";
export type { CredenciaisMt5Abertas, RepositorioCredenciaisMt5 } from "./repositorios/credenciais-mt5.js";
export type {
  ImportacaoB3,
  ImportacaoB3ParaProcessar,
  RepositorioImportacoesB3,
} from "./repositorios/importacoes-b3.js";
export type {
  EstadoSincronizacaoGravado,
  NegociacaoCarteiraGravada,
  NegociacaoCarteiraLida,
  NovaSincronizacao,
  RepositorioCarteira,
  SaldoCarteira,
} from "./repositorios/carteira.js";
export { portaCredenciais } from "./portas/credenciais.js";
export { portaRiscoConta, type AtivoDoSimbolo } from "./portas/risco-conta.js";
export type { NovoAviso, RepositorioAvisos } from "./repositorios/avisos.js";
export type { RepositorioEventosMercado } from "./repositorios/eventos-mercado.js";
export type {
  Aceite,
  AjusteDePosicao,
  ConferenciaAtivo,
  DivergenciaGravada,
  RepositorioDivergencias,
  ResultadoRegistro,
} from "./repositorios/divergencias.js";
export {
  type OrigemGastoIa,
  type RepositorioGastosIa,
  type UsoOrcamentoIa,
} from "./repositorios/gastos-ia.js";
export {
  limitesDominio,
  type LimitesGravados,
  type RepositorioLimitesConta,
} from "./repositorios/limites-conta.js";
export type { RetratoConta, RoboDoRetrato, SaidaComPerda } from "./repositorios/retrato-conta.js";
export type { DadosSituacaoConta, RepositorioRiscoConta } from "./repositorios/risco-conta.js";
export type { ContaCorretora, NovaConta, RedeConta } from "./repositorios/contas.js";
export {
  cifrarTokenClaude,
  decifrarTokenClaude,
  type RepositorioCredenciaisClaude,
  type ResultadoTesteGravado,
} from "./repositorios/credenciais-claude.js";
export type { DadosProposta, DecisaoComOrdem, FiltroDecisoes } from "./repositorios/decisoes.js";
export type { DadosEstrategia, DetalheEstrategia } from "./repositorios/estrategias.js";
export { validarDadosEstrategia } from "./repositorios/estrategias.js";
export { LIMITE_MAXIMO_LISTA } from "./repositorios/lista.js";
export type { RegistroImobiliario, ValidarRegistro } from "./repositorios/imobiliario.js";
export type {
  CandleDTO,
  CoberturaCandles,
  ConsultaCandles,
  LoteCandles,
  UltimoFechamento,
} from "./repositorios/mercado.js";
export type {
  ContagemSincronizacao,
  DadosItem,
  ItemPluggyLinha,
  TituloSincronizado,
} from "./repositorios/pluggy.js";
export type { EstadoIndicador, LinhaTitulo, PontoIndicador } from "./repositorios/renda-fixa.js";
export type { Resumo } from "./repositorios/resumo.js";
export type { MudancaRobo, NovoRobo } from "./repositorios/robos.js";
export type { Sessao } from "./repositorios/sessoes.js";
export type { Escopo, TokenApi } from "./repositorios/tokens.js";
export type { Usuario, UsuarioComSenha } from "./repositorios/usuarios.js";
export type { VerificacaoAuditoria } from "./repositorios/auditoria.js";
export { VALIDADE_APROVACAO_PADRAO_MS } from "./portas/decisoes.js";
export { portaPlacar } from "./portas/placar.js";
export { LIMITE_PLACAR, type FiltroPlacarBanco, type RepositorioPlacar } from "./repositorios/placar.js";
export * as esquema from "./esquema/index.js";
export {
  repositorioReplay,
  type AnaliseReplay,
  type NovaAnaliseReplay,
  type RepositorioReplay,
  type VereditoReplay,
} from "./repositorios/replay.js";
