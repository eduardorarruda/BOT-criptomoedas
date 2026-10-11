import type { PortaDecisoes, PortaOrdens, PortaRobos } from "@zentrade/contratos";
import { conectar, type Conexao } from "./cliente.js";
import { portaCredenciais } from "./portas/credenciais.js";
import { portaDecisoes } from "./portas/decisoes.js";
import { portaOrdens } from "./portas/ordens.js";
import { portaRobos } from "./portas/robos.js";
import { repositorioAssistente } from "./repositorios/assistente.js";
import { repositorioConhecimentoDetalhe } from "./repositorios/assistente-conhecimento.js";
import { repositorioAuditoria } from "./repositorios/auditoria.js";
import { repositorioBacktests } from "./repositorios/backtests.js";
import { repositorioCarteira } from "./repositorios/carteira.js";
import { repositorioConfiguracao } from "./repositorios/configuracao.js";
import { repositorioConhecimento } from "./repositorios/conhecimento.js";
import { repositorioContas } from "./repositorios/contas.js";
import { repositorioDecisoes } from "./repositorios/decisoes.js";
import { repositorioEstrategias } from "./repositorios/estrategias.js";
import { repositorioMercado } from "./repositorios/mercado.js";
import { repositorioOrdens } from "./repositorios/ordens.js";
import { repositorioResumo } from "./repositorios/resumo.js";
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
}

export interface OpcoesBanco extends OpcoesConexaoBanco {
  /** 32 bytes (leia com lerChaveMestra de ZENTRADE_CHAVE_MESTRA). */
  readonly chaveMestra: Buffer;
}

export interface PortasMotor {
  readonly robos: PortaRobos;
  readonly decisoes: PortaDecisoes;
  readonly ordens: PortaOrdens;
}

function abrir(opcoes: OpcoesConexaoBanco): { conexao: Conexao; portas: PortasMotor } {
  const conexao: Conexao = conectar(opcoes.url, {
    ...(opcoes.maximoConexoes !== undefined ? { maximo: opcoes.maximoConexoes } : {}),
    ...(opcoes.aoAviso ? { aoAviso: opcoes.aoAviso } : {}),
  });
  const { db } = conexao;
  const portas: PortasMotor = {
    robos: portaRobos(db),
    decisoes: portaDecisoes(
      db,
      opcoes.validadeAprovacaoMs !== undefined ? { validadeAprovacaoMs: opcoes.validadeAprovacaoMs } : {},
    ),
    ordens: portaOrdens(db),
  };
  return { conexao, portas };
}

export interface OpcoesBancoDoMotor extends OpcoesConexaoBanco {
  /** Só fora do papel: decifra a chave de corretora de cada pessoa (PortaCredenciais). */
  readonly chaveMestra?: Buffer;
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
    mercado: repositorioMercado(conexao.db),
    backtests: repositorioBacktests(conexao.db),
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
  return {
    conexao,
    portas,
    usuarios: repositorioUsuarios(db, opcoes.chaveMestra),
    sessoes: repositorioSessoes(db),
    tokens: repositorioTokens(db),
    contas: repositorioContas(db, opcoes.chaveMestra),
    credenciais: portaCredenciais(db, opcoes.chaveMestra),
    carteira: repositorioCarteira(db),
    configuracao: repositorioConfiguracao(db),
    auditoria: repositorioAuditoria(db),
    estrategias: repositorioEstrategias(db),
    robos: repositorioRobos(db),
    decisoes: repositorioDecisoes(db),
    ordens: repositorioOrdens(db),
    mercado: repositorioMercado(db),
    backtests: repositorioBacktests(db),
    conhecimento: repositorioConhecimento(db),
    conhecimentoDetalhe: repositorioConhecimentoDetalhe(db),
    assistente: repositorioAssistente(db),
    resumo: repositorioResumo(db),
    sistema: repositorioSistema(db),
    fechar: () => conexao.fechar(),
  };
}

export type Banco = ReturnType<typeof criarBanco>;
