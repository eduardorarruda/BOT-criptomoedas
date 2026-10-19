import { criarBancoDoMotor, type BancoDoMotor } from "@zentrade/banco";
import { ativosDoSimbolo } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { resolve } from "node:path";
import type { Logger } from "pino";
import { consumirBacktests, type ConsumidorBacktests } from "./backtest/fila.js";
import { cacheDeCandlesDoBacktest, criarDadosHistoricos, redeDosDadosAoVivo } from "./dados-backtest.js";
import {
  criarAgendadorMt5,
  NOME_ATUALIZACAO_MT5,
  processarAtualizacaoMt5,
  type DependenciasAtualizacaoDiaria,
} from "./dados-b3/atualizacao-mt5.js";
import {
  consumirAtualizacoesMt5,
  consumirImportacoesB3,
  type ConsumidorImportacoesB3,
} from "./dados-b3/fila.js";
import { criarFonteBarrasMt5Http } from "./dados-b3/fonte-mt5.js";
import { processarImportacaoB3 } from "./dados-b3/processar-importacao.js";
import { papeisDoMotor } from "./funcao.js";
import { processarBacktest } from "./backtest/servico.js";
import { montarMotor } from "./composicao.js";
import { ligarAvaliador, type AvaliadorLigado } from "./placar/avaliador.js";
import { RelogioSistema } from "./relogio.js";
import { lerConfig, type Config } from "./config.js";
import { Motor } from "./motor.js";
import { criarRegistro } from "./registro.js";
import { carregarRobos } from "./robos-arquivo.js";

interface Infra {
  readonly banco?: BancoDoMotor;
  readonly redis?: Redis;
}

function abrirInfra(config: Config, registro: Logger): Infra {
  const banco = config.DATABASE_URL
    ? criarBancoDoMotor({
        url: config.DATABASE_URL,
        validadeAprovacaoMs: config.APROVACAO_VALIDADE_MIN * 60_000,
        fuso: config.ZENTRADE_FUSO,
        ...(config.ZENTRADE_CHAVE_MESTRA ? { chaveMestra: config.ZENTRADE_CHAVE_MESTRA } : {}),
        ativoDoSimbolo: (simbolo) => ativosDoSimbolo(simbolo).base,
        aoAviso: (mensagem) => registro.debug({ mensagem }, "aviso do PostgreSQL"),
      })
    : undefined;
  // maxRetriesPerRequest: null é exigência do BullMQ para o consumidor da fila.
  const redis = config.REDIS_URL
    ? new Redis(config.REDIS_URL, { connectionName: "zentrade-motor", maxRetriesPerRequest: null })
    : undefined;
  redis?.on("error", (erro) => registro.warn({ erro }, "Redis com problema; o ioredis reconecta sozinho"));
  return { ...(banco ? { banco } : {}), ...(redis ? { redis } : {}) };
}

function ligarBacktests(config: Config, infra: Infra, registro: Logger): ConsumidorBacktests | undefined {
  const { banco, redis } = infra;
  if (!banco || !redis) {
    registro.warn({}, "sem DATABASE_URL e REDIS_URL, a fila de backtests não é consumida");
    return undefined;
  }
  const deps = {
    backtests: banco.backtests,
    fontes: {
      banco: cacheDeCandlesDoBacktest(redeDosDadosAoVivo(config), banco.mercado),
      corretora: criarDadosHistoricos(registro),
    },
    registro,
  };
  const opcoes = {
    saldoInicial: dec(config.MOTOR_BACKTEST_SALDO),
    riscoPorOperacao: config.MOTOR_BACKTEST_RISCO,
    fuso: config.ZENTRADE_FUSO,
  };
  return consumirBacktests(redis, (id) => processarBacktest(deps, opcoes, id), registro);
}

/** A mesma fila BullMQ e processo dos backtests: upload da B3 também é CPU por minutos. */
function ligarImportacoesB3(infra: Infra, registro: Logger): ConsumidorImportacoesB3 | undefined {
  const { banco, redis } = infra;
  if (!banco || !redis) {
    registro.warn({}, "sem DATABASE_URL e REDIS_URL, a fila de importações da B3 não é consumida");
    return undefined;
  }
  return consumirImportacoesB3(
    redis,
    (id) =>
      processarImportacaoB3({ banco: banco.mercado, repositorio: banco.importacoesB3, agora: Date.now }, id),
    registro,
  );
}

/**
 * "Atualizar dados do WIN" pelo MetaTrader 5: a fila do botão e, depois do fechamento, a
 * atualização diária (desligável). Só no processo motor-backtests, e só com a chave mestra
 * (sem ela não há como decifrar a conta).
 */
function ligarAtualizacaoMt5(
  config: Config,
  infra: Infra,
  registro: Logger,
): { fechar(): Promise<void> } | undefined {
  const { banco, redis } = infra;
  const contas = banco?.credenciaisMt5;
  if (!banco || !redis || !contas) {
    registro.warn(
      {},
      "sem banco, Redis ou ZENTRADE_CHAVE_MESTRA, a atualização do WIN pelo MT5 fica desligada",
    );
    return undefined;
  }
  const deps: DependenciasAtualizacaoDiaria = {
    banco: banco.mercado,
    repositorio: banco.importacoesB3,
    credenciais: (usuarioId) => contas.credenciais(usuarioId),
    ultimaVela: async () =>
      (await banco.mercado.cobertura(["WIN"])).find((c) => c.intervalo === "5m")?.ultimo ?? null,
    criarFonte: (conta) => criarFonteBarrasMt5Http({ url: config.COLETOR_MT5_URL ?? "", conta }),
    agora: Date.now,
    historicoDias: config.MOTOR_MT5_HISTORICO_DIAS,
    coletorConfigurado: Boolean(config.COLETOR_MT5_URL),
  };
  const consumidor = consumirAtualizacoesMt5(redis, (id) => processarAtualizacaoMt5(deps, id), registro);
  const agendador = criarAgendadorMt5({
    agora: Date.now,
    hora: config.MOTOR_MT5_HORA,
    executar: async () => {
      const [dono] = await contas.donos();
      if (!dono) return;
      const linha = await banco.importacoesB3.criar(dono, `${NOME_ATUALIZACAO_MT5} · automático`, "");
      await processarAtualizacaoMt5(deps, linha.id);
    },
  });
  const relogio = config.MOTOR_MT5_AUTO
    ? setInterval(() => {
        agendador
          .tick()
          .catch((erro: unknown) => registro.error({ erro }, "atualização diária do WIN pelo MT5 falhou"));
      }, 60_000)
    : undefined;
  return {
    fechar: async () => {
      if (relogio) clearInterval(relogio);
      await consumidor.fechar();
    },
  };
}

/** O avaliador do placar do Claude: só no processo dos robôs, com banco (lê candles e decisões dele). */
function ligarPlacar(config: Config, infra: Infra, registro: Logger): AvaliadorLigado | undefined {
  if (!config.MOTOR_PLACAR || !infra.banco) return undefined;
  return ligarAvaliador(
    { placar: infra.banco.placar, candles: infra.banco.mercado, relogio: new RelogioSistema(), registro },
    {
      lote: config.MOTOR_PLACAR_LOTE,
      janelaDias: config.MOTOR_PLACAR_DIAS,
      revisarMs: config.MOTOR_PLACAR_MINUTOS * 60_000,
      intervaloMs: config.MOTOR_PLACAR_MINUTOS * 60_000,
      placar: {
        horizonte: config.MOTOR_PLACAR_HORIZONTE,
        bpsContra: config.MOTOR_PLACAR_BPS,
        aquecimento: 300,
      },
    },
  );
}

const motorDe = (m: ReturnType<typeof montarMotor>) => [m.deps, m.opcoesMotor] as const;

/** Liga o motor: configuração validada, banco (ou arquivo), Redis, fila e desligamento gracioso. */
async function principal(): Promise<void> {
  const config = lerConfig(process.env);
  const registro = criarRegistro(config.LOG_LEVEL);
  vigiarProcesso(registro);
  const infra = abrirInfra(config, registro);
  const arquivo = infra.banco
    ? undefined
    : await carregarRobos(resolve(config.MOTOR_ROBOS_ARQUIVO), config.MOTOR_REDE);
  const banco = infra.banco
    ? {
        portas: infra.banco.portas,
        mercado: infra.banco.mercado,
        credenciais: infra.banco.credenciais,
        riscoConta: infra.banco.riscoConta,
      }
    : undefined;
  const fontes = {
    ...(banco ? { banco } : {}),
    ...(infra.redis ? { redis: infra.redis } : {}),
    ...(arquivo ? { arquivo } : {}),
  };
  const papeis = papeisDoMotor(config.MOTOR_FUNCAO);
  const motor = papeis.robos ? new Motor(...motorDe(montarMotor(config, fontes, registro))) : undefined;
  const { ligados, falharam } = motor ? await motor.iniciar() : { ligados: 0, falharam: 0 };
  const backtests = papeis.backtests ? ligarBacktests(config, infra, registro) : undefined;
  const importacoesB3 = papeis.backtests ? ligarImportacoesB3(infra, registro) : undefined;
  const atualizacaoMt5 = papeis.backtests ? ligarAtualizacaoMt5(config, infra, registro) : undefined;
  const placar = papeis.robos ? ligarPlacar(config, infra, registro) : undefined;
  registro.info(
    {
      funcao: config.MOTOR_FUNCAO,
      rede: config.MOTOR_REDE,
      ligados,
      falharam,
      banco: Boolean(infra.banco),
      redis: Boolean(infra.redis),
      placar: Boolean(placar),
    },
    "motor no ar",
  );
  aoDesligar(registro, async () => {
    await backtests?.fechar();
    await importacoesB3?.fechar();
    await atualizacaoMt5?.fechar();
    await placar?.parar();
    await motor?.parar();
    await infra.redis?.quit();
    await infra.banco?.fechar();
  });
}

function vigiarProcesso(registro: Logger): void {
  process.on("unhandledRejection", (erro) => {
    registro.fatal(
      { erro },
      "promessa rejeitada sem tratamento: o motor vai sair para não seguir num estado desconhecido",
    );
    process.exit(1);
  });
  process.on("uncaughtException", (erro) => {
    registro.fatal({ erro }, "exceção sem tratamento: o motor vai sair");
    process.exit(1);
  });
}

function aoDesligar(registro: Logger, fechar: () => Promise<void>): void {
  let saindo = false;
  const desligar = async (sinal: string): Promise<void> => {
    if (saindo) return;
    saindo = true;
    registro.info({ sinal }, "desligando: esperando as decisões em andamento");
    try {
      await fechar();
      registro.info({}, "motor desligado");
      process.exit(0);
    } catch (erro) {
      registro.error({ erro }, "falha ao desligar com graça");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void desligar("SIGTERM"));
  process.on("SIGINT", () => void desligar("SIGINT"));
}

principal().catch((erro: unknown) => {
  // Sem logger ainda (a configuração pode ser o problema): vai para o stderr.
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
