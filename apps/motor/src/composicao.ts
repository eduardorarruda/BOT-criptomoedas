import type {
  Corretora,
  PortaAgente,
  PortaAprovacao,
  PortaCandles,
  PortaCredenciais,
  PortaDecisoes,
  PortaOrdens,
  PortaProtecoes,
  PortaRiscoConta,
  PortaRobos,
  RoboConfig,
} from "@zentrade/contratos";
import {
  ativosDoSimbolo,
  BinanceCorretora,
  ContaBinance,
  disjuntorDaRede,
  PapelCorretora,
} from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { conferirChaveParaOperar } from "./chave-segura.js";
import type { Config } from "./config.js";
import { CorretorasPorPessoa } from "./corretoras-por-pessoa.js";
import type { OpcoesMotor } from "./motor.js";
import { OPCOES_PADRAO, type Dependencias, type Registro } from "./nucleo/tipos.js";
import { CorretoraPapelAoVivo } from "./papel-ao-vivo.js";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { AgenteHttp } from "./portas/agente-http.js";
import { EventosNoRegistro } from "./portas/eventos-registro.js";
import {
  AprovacaoMemoria,
  DecisoesMemoria,
  OrdensMemoria,
  ProtecoesMemoria,
  RobosMemoria,
} from "./portas/memoria.js";
import { BatidaRedis, EventosRedis, type ClienteRedis } from "./portas/redis.js";
import { riscoContaSeguro } from "./portas/risco-conta.js";
import { RobosDaRede } from "./portas/robos-da-rede.js";
import type { RobosCarregados } from "./robos-arquivo.js";
import { dormirReal, RelogioSistema } from "./relogio.js";

const COTACAO_PAPEL = ativosDoSimbolo("BTCUSDT").cotacao;
const SAUDE_MS = 30_000;

/**
 * A corretora padrão do motor. Na testnet, os robôs ligam com a corretora da pessoa
 * (corretorasDasPessoas); esta só leva a chave do ambiente em desenvolvimento.
 */
export function criarCorretora(config: Config, registro: Registro): Corretora {
  const aoErroWebSocket = (erro: Error) => registro.warn({ erro }, "WebSocket da Binance com problema");
  if (config.MOTOR_REDE === "testnet")
    return new BinanceCorretora({
      rede: "testnet",
      ...(chaveDoAmbiente(config) ?? {}),
      taxaEstimada: config.BINANCE_TAXA_ESTIMADA,
      aoErroWebSocket,
      disjuntor: disjuntorDaRede("testnet"),
    });
  const papel = new PapelCorretora({
    saldos: { [COTACAO_PAPEL]: dec(config.MOTOR_PAPEL_SALDO) },
    taxa: config.MOTOR_PAPEL_TAXA,
    deslizamentoBps: config.MOTOR_PAPEL_DESLIZAMENTO_BPS,
  });
  return new CorretoraPapelAoVivo(criarDadosPublicos(config, registro), papel);
}

/** Dados de mercado públicos (nenhuma chave): papel ao vivo e candles históricos do backtest. */
export function criarDadosPublicos(config: Config, registro: Registro): BinanceCorretora {
  const aoErroWebSocket = (erro: Error) => registro.warn({ erro }, "WebSocket da Binance com problema");
  return new BinanceCorretora({
    rede: config.MOTOR_PAPEL_DADOS,
    aoErroWebSocket,
    disjuntor: disjuntorDaRede(config.MOTOR_PAPEL_DADOS),
  });
}

export function criarAgente(config: Config): PortaAgente {
  if (config.AGENTE_URL && config.AGENTE_SEGREDO)
    return new AgenteHttp({ url: config.AGENTE_URL, segredo: config.AGENTE_SEGREDO });
  return new AgenteFixo(config.MOTOR_AGENTE_FIXO);
}

/** O que o motor recebe de fora: o banco (portas e candles), o Redis e, sem banco, o arquivo de robôs. */
export interface FontesMotor {
  readonly banco?: {
    readonly portas: {
      robos: PortaRobos;
      decisoes: PortaDecisoes;
      ordens: PortaOrdens;
      protecoes: PortaProtecoes;
    };
    readonly mercado: PortaCandles;
    /** As chaves de corretora de cada pessoa (null sem ZENTRADE_CHAVE_MESTRA). */
    readonly credenciais?: PortaCredenciais | null;
    /** Limites da conta (todos os robôs da pessoa na rede), lidos sob RLS. */
    readonly riscoConta?: PortaRiscoConta | null;
  };
  readonly redis?: ClienteRedis;
  readonly arquivo?: RobosCarregados;
  /** Outra corretora no lugar da escolhida pela configuração (testes de integração, por exemplo). */
  readonly corretora?: Corretora;
}

/** Com banco, a API repassa a proposta ao n8n quando vê o evento da decisão; o motor só registra. */
const aprovacaoPelaApi = (registro: Registro): PortaAprovacao => ({
  solicitar: (decisaoId, _resumo, expiraEm) => {
    registro.info({ decisaoId, expiraEm }, "aprovação pedida: a API repassa ao n8n");
    return Promise.resolve();
  },
});

interface Portas {
  readonly robos: PortaRobos;
  readonly decisoes: PortaDecisoes;
  readonly ordens: PortaOrdens;
  readonly protecoes: PortaProtecoes;
  readonly aprovacao: PortaAprovacao;
}

function portasDaMemoria(f: FontesMotor, registro: Registro, relogio: RelogioSistema): Portas {
  const robos = new RobosMemoria(f.arquivo?.robos ?? []);
  f.arquivo?.pausados.forEach((id) => robos.pausar(id));
  const aprovacao = new AprovacaoMemoria((id) =>
    registro.warn(
      { decisaoId: id },
      "aprovação pedida, mas sem banco a API não tem como responder: vai expirar",
    ),
  );
  const decisoes = new DecisoesMemoria();
  const ordens = new OrdensMemoria(relogio);
  const protecoes = new ProtecoesMemoria(decisoes, ordens, relogio);
  return { robos, decisoes, ordens, protecoes, aprovacao };
}

/** Papel com banco: refaz o saldo simulado com as execuções gravadas, uma vez por robô. */
function prepararPapel(corretora: Corretora, ordens: PortaOrdens): OpcoesMotor["preparar"] {
  if (!(corretora instanceof CorretoraPapelAoVivo)) return undefined;
  let preparados: ReadonlySet<string> = new Set();
  return async (robo: RoboConfig) => {
    if (preparados.has(robo.id)) return;
    corretora.restaurarExecucoes(robo.simbolo, await ordens.execucoes(robo.id));
    preparados = new Set([...preparados, robo.id]);
  };
}

/** Só em desenvolvimento: a chave do ambiente para quem não cadastrou a própria. */
function chaveDoAmbiente(config: Config) {
  const { BINANCE_API_KEY: apiKey, BINANCE_API_SECRET: apiSecret } = config;
  return config.ZENTRADE_AMBIENTE === "desenvolvimento" && apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

/**
 * Fora do papel, cada robô opera com a chave da pessoa dona dele: uma BinanceCorretora
 * por pessoa e rede (CorretorasPorPessoa). Com uma corretora trocada (testes), não.
 */
function corretorasDasPessoas(
  config: Config,
  f: FontesMotor,
  registro: Registro,
): OpcoesMotor["corretoraDe"] {
  if (config.MOTOR_REDE === "papel" || f.corretora) return undefined;
  const aoErroWebSocket = (erro: Error) => registro.warn({ erro }, "WebSocket da Binance com problema");
  const porPessoa = new CorretorasPorPessoa({
    credenciais: f.banco?.credenciais ?? null,
    fallback: chaveDoAmbiente(config),
    criar: (rede, c) =>
      new BinanceCorretora({
        rede,
        ...c,
        taxaEstimada: config.BINANCE_TAXA_ESTIMADA,
        aoErroWebSocket,
        disjuntor: disjuntorDaRede(rede),
      }),
    // Chave com saque não opera; só a rede real informa permissões (/sapi).
    conferirChave: conferirChaveParaOperar((rede, c) =>
      new ContaBinance({ rede, ...c, disjuntor: disjuntorDaRede(rede) }).restricoes(),
    ),
  });
  return (robo) => porPessoa.para(robo);
}

function opcoesDoMotor(
  config: Config,
  f: FontesMotor,
  corretora: Corretora,
  ordens: PortaOrdens,
  registro: Registro,
): OpcoesMotor {
  const batida = f.redis ? new BatidaRedis(f.redis) : null;
  const preparar = f.banco ? prepararPapel(corretora, ordens) : undefined;
  const corretoraDe = corretorasDasPessoas(config, f, registro);
  return {
    ...(corretoraDe ? { corretoraDe } : {}),
    intervaloSaudeMs: SAUDE_MS,
    alertaWebSocketMs: config.MOTOR_ALERTA_WEBSOCKET_MIN * 60_000,
    ...(f.banco ? { intervaloRecargaMs: config.MOTOR_RECARGA_SEGUNDOS * 1000 } : {}),
    ...(batida ? { bater: (em: number) => batida.bater(em) } : {}),
    ...(preparar ? { preparar } : {}),
  };
}

/**
 * Liga as peças. Com banco: portas do packages/banco, robôs de todas as pessoas (só os
 * da rede do motor), recarga periódica. Sem banco: memória e arquivo (só papel; a
 * configuração recusa testnet sem banco). Com Redis: eventos e batida no Redis.
 */
export function montarMotor(config: Config, f: FontesMotor, registro: Registro) {
  const relogio = new RelogioSistema();
  const corretora = f.corretora ?? criarCorretora(config, registro);
  const portas: Portas = f.banco
    ? { ...f.banco.portas, aprovacao: aprovacaoPelaApi(registro) }
    : portasDaMemoria(f, registro, relogio);
  const deps: Dependencias = {
    corretora,
    robos: new RobosDaRede(portas.robos, config.MOTOR_REDE),
    decisoes: portas.decisoes,
    ordens: portas.ordens,
    ...(config.MOTOR_STOP_NA_CORRETORA ? { protecoes: portas.protecoes } : {}),
    agente: criarAgente(config),
    eventos: f.redis ? new EventosRedis(f.redis) : new EventosNoRegistro(registro),
    aprovacao: portas.aprovacao,
    ...(f.banco ? { candles: f.banco.mercado } : {}),
    ...(f.banco?.riscoConta ? { riscoConta: riscoContaSeguro(f.banco.riscoConta, registro) } : {}),
    relogio,
    registro,
    dormir: dormirReal,
    opcoes: {
      ...OPCOES_PADRAO,
      agenteObrigatorio: config.MOTOR_AGENTE_OBRIGATORIO,
      tamanhoHistorico: config.MOTOR_HISTORICO,
      expiracaoAprovacaoMs: config.APROVACAO_VALIDADE_MIN * 60_000,
      stopLimiteBps: config.MOTOR_STOP_LIMITE_BPS,
    },
  };
  return { deps, opcoesMotor: opcoesDoMotor(config, f, corretora, portas.ordens, registro) };
}
