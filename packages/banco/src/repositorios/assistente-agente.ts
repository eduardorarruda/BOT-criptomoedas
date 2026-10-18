import { exigirFuso, FUSO_PADRAO } from "@zentrade/dominio";
import { conectar } from "../cliente.js";
import { repositorioAssistente } from "./assistente.js";
import { repositorioCredenciaisClaude } from "./credenciais-claude.js";
import { redesComConta, repositorioCarteira } from "./carteira.js";
import { repositorioDecisoes } from "./decisoes.js";
import { repositorioGastosIa } from "./gastos-ia.js";
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
  /** Só para o token do Claude Code de cada pessoa. Sem ela, `credenciaisClaude` é null. */
  readonly chaveMestra?: Buffer;
  /** O fuso da instância (ZENTRADE_FUSO): o "hoje" do resumo e do orçamento de IA. */
  readonly fuso?: string;
}

/**
 * O que o agente de IA lê do banco: a configuração do assistente e, para as ferramentas
 * do chat, o resumo, os robôs, as decisões, as ordens e os investimentos (carteira
 * sincronizada da Binance, renda fixa e imobiliário) da pessoa. Leitura sempre sob
 * RLS (comoUsuario): mesmo um bug no agente não alcança dado de outra pessoa. Índices do
 * BCB e candles são dados públicos, iguais para todos. A única escrita é o livro do gasto
 * com IA (gastos_ia) e o token do Claude Code da pessoa (credenciais_claude), também sob
 * RLS. A chave mestra é opcional e serve só para esse token: o agente nunca lê chave de
 * corretora nem segredo de login.
 */
export function criarBancoDoAgente(opcoes: OpcoesBancoDoAgente) {
  const conexao = conectar(opcoes.url, {
    ...(opcoes.maximoConexoes !== undefined ? { maximo: opcoes.maximoConexoes } : {}),
    ...(opcoes.aoAviso ? { aoAviso: opcoes.aoAviso } : {}),
  });
  const { db } = conexao;
  const assistente = repositorioAssistente(db);
  const fuso = exigirFuso(opcoes.fuso ?? FUSO_PADRAO);
  const resumo = repositorioResumo(db, fuso);
  const robos = repositorioRobos(db);
  const decisoes = repositorioDecisoes(db);
  const ordens = repositorioOrdens(db);
  const carteira = repositorioCarteira(db);
  const rendaFixa = repositorioRendaFixa(db);
  const gastosIa = repositorioGastosIa(db, fuso);
  return {
    conexao,
    config: assistente.config,
    configGravada: assistente.configGravada,
    resumo: resumo.resumo,
    robos: robos.listar,
    decisoes: decisoes.listar,
    decisao: decisoes.obter,
    ordens: ordens.listar,
    redesCarteira: (usuarioId: string) => redesComConta(db, usuarioId),
    saldosCarteira: carteira.saldos,
    negociacoesCarteira: carteira.negociacoes,
    sincronizacaoCarteira: carteira.sincronizacao,
    ultimosPrecos: repositorioMercado(db).ultimosFechamentos,
    titulosRendaFixa: (usuarioId: string) => rendaFixa.listar(usuarioId),
    indicador: repositorioIndicadores(db).ler,
    imobiliario: repositorioImobiliario(db).listar,
    /** O orçamento de IA: o agente confere antes de chamar o modelo e grava o gasto depois. */
    usoOrcamentoIa: gastosIa.uso,
    registrarGastoIa: gastosIa.registrar,
    /** O Claude Code de cada pessoa (token cifrado); null sem a chave mestra. */
    credenciaisClaude: opcoes.chaveMestra ? repositorioCredenciaisClaude(db, opcoes.chaveMestra) : null,
    fechar: () => conexao.fechar(),
  };
}

export type BancoDoAgente = ReturnType<typeof criarBancoDoAgente>;
