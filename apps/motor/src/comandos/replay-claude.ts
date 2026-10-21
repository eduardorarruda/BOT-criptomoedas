import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BinanceCorretora, disjuntorDaRede } from "@zentrade/corretora";
import { MS_POR_INTERVALO } from "@zentrade/contratos";
import { lerArgumentosReplay } from "../replay/argumentos.js";
import { candlesComCache } from "../replay/cache-candles.js";
import { rodarComando } from "../replay/comando.js";
import { REPLAY_P1 } from "../replay/p1.js";
import { candlesHistoricos } from "../backtest/candles-historicos.js";
import { AgenteHttp } from "../portas/agente-http.js";
import { abrirBancoDosComandos } from "./banco.js";

// Replay do Claude sobre a estratégia P1: manda os sinais históricos ao agente, com o contexto
// só até cada candle, e compara regra pura × regra + Claude × filtro aleatório. Sem --confirmar
// só estima o custo. Nunca envia ordem nem cria decisão ao vivo (grava em replay_analises).
// No Docker (fora do serviço `motor`, para não mexer nos robôs ao vivo):
//   docker compose ... run --rm --no-deps motor node dist/comandos/replay-claude.js --confirmar
// Detalhes e o desenho: docs/placar-do-claude.md (Fase 2).

const HORA_MS = MS_POR_INTERVALO["1h"];
const TIMEOUT_AGENTE_MS = 150_000;

async function principal(): Promise<void> {
  const args = lerArgumentosReplay(process.argv.slice(2));
  const agoraMs = Date.now();
  // Dados até a hora cheia mais recente (ou o instante fixado, para repetir com os mesmos dados).
  const dadosAteMs = args.dadosAte ? Date.parse(args.dadosAte) : Math.floor(agoraMs / HORA_MS) * HORA_MS;
  const url = process.env["AGENTE_URL"];
  const segredo = process.env["AGENTE_SEGREDO"];
  const banco = abrirBancoDosComandos(process.env);
  // Dados públicos da Binance REAL (nenhuma chave); os candles gravados pelo robô no banco
  // são da testnet e não entram aqui.
  const corretora = new BinanceCorretora({ rede: "real", disjuntor: disjuntorDaRede("real") });
  try {
    const { relatorio } = await rodarComando(args, {
      candles: (simbolo, aquecimento) =>
        candlesComCache(
          {
            pasta: resolve(args.cache),
            simbolo,
            intervalo: REPLAY_P1.intervalo,
            inicio: args.inicioMs - aquecimento * HORA_MS,
            fim: dadosAteMs,
          },
          () =>
            candlesHistoricos(
              { corretora },
              { simbolo, intervalo: REPLAY_P1.intervalo, inicio: args.inicioMs, fim: dadosAteMs },
              aquecimento,
            ),
        ),
      agente:
        url && segredo && !args.soRelatorio
          ? new AgenteHttp({ url, segredo, timeoutMs: TIMEOUT_AGENTE_MS })
          : null,
      conferirAgente: async () => {
        const resposta = await fetch(`${url}/saude`, { signal: AbortSignal.timeout(10_000) });
        const corpo = (await resposta.json().catch(() => null)) as { replay?: boolean } | null;
        if (corpo?.replay !== true)
          throw new Error(
            `o agente em ${url} não entende o modo replay (imagem antiga): ele analisaria os sinais com o banco ao vivo e a data de hoje. Suba um agente com este código e aponte AGENTE_URL para ele.`,
          );
      },
      armazem: banco.replay,
      escrever: (linha) => process.stdout.write(`${linha}\n`),
      escreverArquivo: async (caminho, texto) => {
        await mkdir(dirname(resolve(caminho)), { recursive: true });
        await writeFile(resolve(caminho), texto);
      },
      agora: () => agoraMs,
      dadosAte: new Date(dadosAteMs).toISOString(),
    });
    if (!relatorio) process.stdout.write("Ainda não há análises gravadas: nada para comparar.\n");
  } finally {
    await banco.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`o replay não rodou: ${(erro as Error).message}`);
  process.exitCode = 1;
}
