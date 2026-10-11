import type { PortaDecisoes, PortaOrdens, PortaRobos } from "@zentrade/contratos";
import { conectar, type Conexao } from "./cliente.js";
import { portaDecisoes } from "./portas/decisoes.js";
import { portaOrdens } from "./portas/ordens.js";
import { portaRobos } from "./portas/robos.js";
import { repositorioAuditoria } from "./repositorios/auditoria.js";
import { repositorioBacktests } from "./repositorios/backtests.js";
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

export interface OpcoesBanco {
  readonly url: string;
  /** 32 bytes (leia com lerChaveMestra de ZENTRADE_CHAVE_MESTRA). */
  readonly chaveMestra: Buffer;
  readonly maximoConexoes?: number;
  readonly validadeAprovacaoMs?: number;
  readonly aoAviso?: (mensagem: string) => void;
}

/**
 * Tudo o que o motor e a API precisam do banco. Métodos que recebem `usuarioId`
 * rodam sob RLS (comoUsuario); os demais são acesso de sistema.
 */
export function criarBanco(opcoes: OpcoesBanco) {
  const conexao: Conexao = conectar(opcoes.url, {
    ...(opcoes.maximoConexoes !== undefined ? { maximo: opcoes.maximoConexoes } : {}),
    ...(opcoes.aoAviso ? { aoAviso: opcoes.aoAviso } : {}),
  });
  const { db } = conexao;
  const portas: { robos: PortaRobos; decisoes: PortaDecisoes; ordens: PortaOrdens } = {
    robos: portaRobos(db),
    decisoes: portaDecisoes(
      db,
      opcoes.validadeAprovacaoMs !== undefined ? { validadeAprovacaoMs: opcoes.validadeAprovacaoMs } : {},
    ),
    ordens: portaOrdens(db),
  };
  return {
    conexao,
    portas,
    usuarios: repositorioUsuarios(db, opcoes.chaveMestra),
    sessoes: repositorioSessoes(db),
    tokens: repositorioTokens(db),
    contas: repositorioContas(db, opcoes.chaveMestra),
    configuracao: repositorioConfiguracao(db),
    auditoria: repositorioAuditoria(db),
    estrategias: repositorioEstrategias(db),
    robos: repositorioRobos(db),
    decisoes: repositorioDecisoes(db),
    ordens: repositorioOrdens(db),
    mercado: repositorioMercado(db),
    backtests: repositorioBacktests(db),
    conhecimento: repositorioConhecimento(db),
    resumo: repositorioResumo(db),
    sistema: repositorioSistema(db),
    fechar: () => conexao.fechar(),
  };
}

export type Banco = ReturnType<typeof criarBanco>;
