import { pino, type DestinationStream, type Logger } from "pino";

/**
 * Logger JSON (pino). Erros vão no campo `erro` com pilha; campos de segredo saem
 * ocultos mesmo que alguém os passe por engano.
 */
export function criarRegistro(nivel: string, destino?: DestinationStream): Logger {
  const opcoes = {
    level: nivel,
    base: { servico: "motor" },
    serializers: { erro: pino.stdSerializers.err },
    redact: {
      paths: ["apiKey", "apiSecret", "segredo", "*.apiKey", "*.apiSecret", "*.segredo"],
      censor: "[oculto]",
    },
  };
  return destino ? pino(opcoes, destino) : pino(opcoes);
}
