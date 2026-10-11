import { criarBancoDoMotor, type BancoDoMotor } from "@zentrade/banco";
import { dec } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { resolve } from "node:path";
import type { Logger } from "pino";
import { consumirBacktests, type ConsumidorBacktests } from "./backtest/fila.js";
import { processarBacktest } from "./backtest/servico.js";
import { criarDadosPublicos, montarMotor } from "./composicao.js";
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
        ...(config.ZENTRADE_CHAVE_MESTRA ? { chaveMestra: config.ZENTRADE_CHAVE_MESTRA } : {}),
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
    fontes: { banco: banco.mercado, corretora: criarDadosPublicos(config, registro) },
    registro,
  };
  const opcoes = {
    saldoInicial: dec(config.MOTOR_BACKTEST_SALDO),
    riscoPorOperacao: config.MOTOR_BACKTEST_RISCO,
  };
  return consumirBacktests(redis, (id) => processarBacktest(deps, opcoes, id), registro);
}

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
    ? { portas: infra.banco.portas, mercado: infra.banco.mercado, credenciais: infra.banco.credenciais }
    : undefined;
  const fontes = {
    ...(banco ? { banco } : {}),
    ...(infra.redis ? { redis: infra.redis } : {}),
    ...(arquivo ? { arquivo } : {}),
  };
  const { deps, opcoesMotor } = montarMotor(config, fontes, registro);
  const motor = new Motor(deps, opcoesMotor);
  const { ligados, falharam } = await motor.iniciar();
  const backtests = ligarBacktests(config, infra, registro);
  registro.info(
    { rede: config.MOTOR_REDE, ligados, falharam, banco: Boolean(infra.banco), redis: Boolean(infra.redis) },
    "motor no ar",
  );
  aoDesligar(registro, async () => {
    await backtests?.fechar();
    await motor.parar();
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
