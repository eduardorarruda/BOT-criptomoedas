import { conectar } from "../cliente.js";
import { repositorioAssistente } from "./assistente.js";
import { repositorioDecisoes } from "./decisoes.js";
import { repositorioOrdens } from "./ordens.js";
import { repositorioResumo } from "./resumo.js";
import { repositorioRobos } from "./robos.js";

export interface OpcoesBancoDoAgente {
  readonly url: string;
  readonly maximoConexoes?: number;
  readonly aoAviso?: (mensagem: string) => void;
}

/**
 * O que o agente de IA lê do banco: a configuração do assistente e, para as ferramentas
 * do chat, o resumo, os robôs, as decisões e as ordens da pessoa. Só leitura e sempre
 * sob RLS (comoUsuario): mesmo um bug no agente não alcança dado de outra pessoa. Não
 * pede a chave mestra: o agente nunca lê chave de corretora nem segredo de login.
 */
export function criarBancoDoAgente(opcoes: OpcoesBancoDoAgente) {
  const conexao = conectar(opcoes.url, {
    ...(opcoes.maximoConexoes !== undefined ? { maximo: opcoes.maximoConexoes } : {}),
    ...(opcoes.aoAviso ? { aoAviso: opcoes.aoAviso } : {}),
  });
  const { db } = conexao;
  const assistente = repositorioAssistente(db);
  const resumo = repositorioResumo(db);
  const robos = repositorioRobos(db);
  const decisoes = repositorioDecisoes(db);
  const ordens = repositorioOrdens(db);
  return {
    conexao,
    config: assistente.config,
    resumo: resumo.resumo,
    robos: robos.listar,
    decisoes: decisoes.listar,
    decisao: decisoes.obter,
    ordens: ordens.listar,
    fechar: () => conexao.fechar(),
  };
}

export type BancoDoAgente = ReturnType<typeof criarBancoDoAgente>;
