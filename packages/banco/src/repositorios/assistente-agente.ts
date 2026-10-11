import { conectar } from "../cliente.js";
import { repositorioAssistente } from "./assistente.js";
import { repositorioCarteira } from "./carteira.js";
import { repositorioDecisoes } from "./decisoes.js";
import { repositorioImobiliario } from "./imobiliario.js";
import { repositorioMercado } from "./mercado.js";
import { repositorioOrdens } from "./ordens.js";
import { repositorioIndicadores, repositorioRendaFixa } from "./renda-fixa.js";
import { repositorioResumo } from "./resumo.js";
import { repositorioRobos } from "./robos.js";

export interface OpcoesBancoDoAgente {
  readonly url: string;
  readonly maximoConexoes?: number;
  readonly aoAviso?: (mensagem: string) => void;
}

/**
 * O que o agente de IA lê do banco: a configuração do assistente e, para as ferramentas
 * do chat, o resumo, os robôs, as decisões, as ordens e os investimentos (carteira
 * sincronizada da Binance, renda fixa e imobiliário) da pessoa. Só leitura e sempre sob
 * RLS (comoUsuario): mesmo um bug no agente não alcança dado de outra pessoa. Índices do
 * BCB e candles são dados públicos, iguais para todos. Não pede a chave mestra: o agente
 * nunca lê chave de corretora nem segredo de login.
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
  const carteira = repositorioCarteira(db);
  const rendaFixa = repositorioRendaFixa(db);
  return {
    conexao,
    config: assistente.config,
    configGravada: assistente.configGravada,
    resumo: resumo.resumo,
    robos: robos.listar,
    decisoes: decisoes.listar,
    decisao: decisoes.obter,
    ordens: ordens.listar,
    redesCarteira: carteira.redes,
    saldosCarteira: carteira.saldos,
    negociacoesCarteira: carteira.negociacoes,
    sincronizacaoCarteira: carteira.sincronizacao,
    ultimosPrecos: repositorioMercado(db).ultimosFechamentos,
    titulosRendaFixa: (usuarioId: string) => rendaFixa.listar(usuarioId),
    indicador: repositorioIndicadores(db).ler,
    imobiliario: repositorioImobiliario(db).listar,
    fechar: () => conexao.fechar(),
  };
}

export type BancoDoAgente = ReturnType<typeof criarBancoDoAgente>;
