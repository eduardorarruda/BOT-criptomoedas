import { resolve } from "node:path";
import { montarDependencias } from "./composicao.js";
import { lerConfig } from "./config.js";
import { Motor } from "./motor.js";
import { criarRegistro } from "./registro.js";
import { carregarRobos } from "./robos-arquivo.js";

/** Liga o motor: configuração validada, robôs do arquivo, desligamento gracioso no SIGTERM. */
async function principal(): Promise<void> {
  const config = lerConfig(process.env);
  const registro = criarRegistro(config.LOG_LEVEL);
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

  const carregados = await carregarRobos(resolve(config.MOTOR_ROBOS_ARQUIVO), config.MOTOR_REDE);
  const { deps } = montarDependencias(config, carregados, registro);
  const motor = new Motor(deps);
  const { ligados, falharam } = await motor.iniciar();
  registro.info({ rede: config.MOTOR_REDE, ligados, falharam }, "motor no ar");

  let saindo = false;
  const desligar = async (sinal: string): Promise<void> => {
    if (saindo) return;
    saindo = true;
    registro.info({ sinal }, "desligando: esperando as decisões em andamento");
    await motor.parar();
    registro.info({}, "motor desligado");
    process.exit(0);
  };
  process.on("SIGTERM", () => void desligar("SIGTERM"));
  process.on("SIGINT", () => void desligar("SIGINT"));
}

principal().catch((erro: unknown) => {
  // Sem logger ainda (a configuração pode ser o problema): vai para o stderr.
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
