import type { PortaDecisoes, PortaOrdens, PortaProtecoes, PortaRobos } from "@zentrade/contratos";
import { exigirFuso, FUSO_PADRAO } from "@zentrade/dominio";
import { conectar, type Conexao } from "./cliente.js";
import { portaAgendaEventos } from "./portas/agenda-eventos.js";
import { portaCredenciais } from "./portas/credenciais.js";
import { portaDecisoes } from "./portas/decisoes.js";
import { portaOrdens } from "./portas/ordens.js";
import { repositorioReplay } from "./repositorios/replay.js";
import { portaPlacar } from "./portas/placar.js";
import { portaProtecoes } from "./portas/protecoes.js";
import { portaRiscoConta, type AtivoDoSimbolo } from "./portas/risco-conta.js";
import { portaRobos } from "./portas/robos.js";
import { repositorioAssistente } from "./repositorios/assistente.js";
import { repositorioConhecimentoDetalhe } from "./repositorios/assistente-conhecimento.js";
import { repositorioAuditoria } from "./repositorios/auditoria.js";
import { repositorioAvisos } from "./repositorios/avisos.js";
import { repositorioEventosMercado } from "./repositorios/eventos-mercado.js";
import { repositorioBacktests } from "./repositorios/backtests.js";
import { repositorioCarteira } from "./repositorios/carteira.js";
import { repositorioConfiguracao } from "./repositorios/configuracao.js";
import { repositorioConhecimento } from "./repositorios/conhecimento.js";
import { repositorioContas } from "./repositorios/contas.js";
import { repositorioCredenciaisMt5 } from "./repositorios/credenciais-mt5.js";
import { repositorioCredenciaisClaude } from "./repositorios/credenciais-claude.js";
import { repositorioDecisoes } from "./repositorios/decisoes.js";
import { repositorioDivergencias } from "./repositorios/divergencias.js";
import { repositorioEstrategias } from "./repositorios/estrategias.js";
import { repositorioGastosIa } from "./repositorios/gastos-ia.js";
import { repositorioImobiliario } from "./repositorios/imobiliario.js";
import { repositorioImportacoesB3 } from "./repositorios/importacoes-b3.js";
import { repositorioLimitesConta } from "./repositorios/limites-conta.js";
import { repositorioMercado } from "./repositorios/mercado.js";
import { repositorioOrdens } from "./repositorios/ordens.js";
import { repositorioPlacar } from "./repositorios/placar.js";
import { repositorioPluggy } from "./repositorios/pluggy.js";
import { repositorioIndicadores, repositorioRendaFixa } from "./repositorios/renda-fixa.js";
import { repositorioResumo } from "./repositorios/resumo.js";
import { repositorioRiscoConta } from "./repositorios/risco-conta.js";
import { repositorioRobos } from "./repositorios/robos.js";
import { repositorioSessoes } from "./repositorios/sessoes.js";
import { repositorioSistema } from "./repositorios/sistema.js";
import { repositorioTokens } from "./repositorios/tokens.js";
import { repositorioUsuarios } from "./repositorios/usuarios.js";

export interface OpcoesConexaoBanco {
  readonly url: string;
  readonly maximoConexoes?: number;
  readonly validadeAprovacaoMs?: number;
  readonly aoAviso?: (mensagem: string) => void;
  /**
   * O fuso da instância (ZENTRADE_FUSO, já validado): onde começa o "hoje" do resumo,
   * da perda do dia da conta e do orçamento de IA. Padrão: America/Sao_Paulo.
   */
  readonly fuso?: string;
}

/** O fuso das opções, conferido: um nome errado derruba cedo, na montagem do banco. */
const fusoDe = (opcoes: OpcoesConexaoBanco): string => exigirFuso(opcoes.fuso ?? FUSO_PADRAO);

export interface OpcoesBanco extends OpcoesConexaoBanco {
  /** 32 bytes (leia com lerChaveMestra de ZENTRADE_CHAVE_MESTRA). */
  readonly chaveMestra: Buffer;
}

export interface PortasMotor {
  readonly robos: PortaRobos;
  readonly decisoes: PortaDecisoes;
  readonly ordens: PortaOrdens;
  readonly protecoes: PortaProtecoes;
}

function abrir(opcoes: OpcoesConexaoBanco): { conexao: Conexao; portas: PortasMotor } {
  const conexao: Conexao = conectar(opcoes.url, {
    ...(opcoes.maximoConexoes !== undefined ? { maximo: opcoes.maximoConexoes } : {}),
    ...(opcoes.aoAviso ? { aoAviso: opcoes.aoAviso } : {}),
  });
  const { db } = conexao;
  const validade =
    opcoes.validadeAprovacaoMs !== undefined ? { validadeAprovacaoMs: opcoes.validadeAprovacaoMs } : {};
  const portas: PortasMotor = {
    robos: portaRobos(db),
    decisoes: portaDecisoes(db, validade),
    ordens: portaOrdens(db),
    protecoes: portaProtecoes(db, validade),
  };
  return { conexao, portas };
}

export interface OpcoesBancoDoMotor extends OpcoesConexaoBanco {
  /** Só fora do papel: decifra a chave de corretora de cada pessoa (PortaCredenciais). */
  readonly chaveMestra?: Buffer;
  /**
   * O ativo-base de um par ("BTCUSDT" → "BTC"), para achar as divergências do robô.
   * Sem ele, `riscoConta` fica null e o motor só aplica os limites de cada robô.
   */
  readonly ativoDoSimbolo?: AtivoDoSimbolo;
}

/**
 * Só o que o motor usa (portas, candles e backtests), tudo acesso de sistema. A chave
 * mestra é opcional: sem ela (papel), `credenciais` é null e o motor não lê chave nenhuma.
 */
export function criarBancoDoMotor(opcoes: OpcoesBancoDoMotor) {
  const { conexao, portas } = abrir(opcoes);
  return {
    conexao,
    portas,
    credenciais: opcoes.chaveMestra ? portaCredenciais(conexao.db, opcoes.chaveMestra) : null,
    agendaEventos: portaAgendaEventos(conexao.db),
    eventosMercado: repositorioEventosMercado(conexao.db),
    riscoConta: opcoes.ativoDoSimbolo
      ? portaRiscoConta(conexao.db, opcoes.ativoDoSimbolo, fusoDe(opcoes))
      : null,
    mercado: repositorioMercado(conexao.db),
    backtests: repositorioBacktests(conexao.db),
    importacoesB3: repositorioImportacoesB3(conexao.db),
    credenciaisMt5: opcoes.chaveMestra ? repositorioCredenciaisMt5(conexao.db, opcoes.chaveMestra) : null,
    placar: portaPlacar(conexao.db),
    replay: repositorioReplay(conexao.db),
    fechar: () => conexao.fechar(),
  };
}

export type BancoDoMotor = ReturnType<typeof criarBancoDoMotor>;

/**
 * Tudo o que o motor e a API precisam do banco. Métodos que recebem `usuarioId`
 * rodam sob RLS (comoUsuario); os demais são acesso de sistema.
 */
export function criarBanco(opcoes: OpcoesBanco) {
  const { conexao, portas } = abrir(opcoes);
  const { db } = conexao;
  const fuso = fusoDe(opcoes);
  return {
    conexao,
    portas,
    usuarios: repositorioUsuarios(db, opcoes.chaveMestra),
    sessoes: repositorioSessoes(db),
    tokens: repositorioTokens(db),
    contas: repositorioContas(db, opcoes.chaveMestra),
    credenciais: portaCredenciais(db, opcoes.chaveMestra),
    credenciaisClaude: repositorioCredenciaisClaude(db, opcoes.chaveMestra),
    carteira: repositorioCarteira(db),
    configuracao: repositorioConfiguracao(db),
    auditoria: repositorioAuditoria(db),
    estrategias: repositorioEstrategias(db),
    robos: repositorioRobos(db),
    decisoes: repositorioDecisoes(db),
    placar: repositorioPlacar(db),
    ordens: repositorioOrdens(db),
    mercado: repositorioMercado(db),
    backtests: repositorioBacktests(db),
    importacoesB3: repositorioImportacoesB3(db),
    credenciaisMt5: repositorioCredenciaisMt5(db, opcoes.chaveMestra),
    conhecimento: repositorioConhecimento(db),
    conhecimentoDetalhe: repositorioConhecimentoDetalhe(db),
    assistente: repositorioAssistente(db),
    resumo: repositorioResumo(db, fuso),
    imobiliario: repositorioImobiliario(db),
    sistema: repositorioSistema(db),
    rendaFixa: repositorioRendaFixa(db),
    indicadores: repositorioIndicadores(db),
    pluggy: repositorioPluggy(db),
    limitesConta: repositorioLimitesConta(db),
    riscoConta: repositorioRiscoConta(db, fuso),
    divergencias: repositorioDivergencias(db),
    avisos: repositorioAvisos(db),
    eventosMercado: repositorioEventosMercado(db),
    gastosIa: repositorioGastosIa(db, fuso),
    fechar: () => conexao.fechar(),
  };
}

export type Banco = ReturnType<typeof criarBanco>;
