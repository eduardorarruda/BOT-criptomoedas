import { parentPort, workerData } from "node:worker_threads";
import { extrairTexto, type TipoExtraivel } from "@zentrade/conhecimento";

// Roda numa worker thread com teto de memória (ver extracao-isolada.ts). Só sintaxe
// que o Node apaga sozinho (type stripping): em teste, ele roda o .ts direto.
const pedido = workerData as { bytes: Uint8Array; tipo: TipoExtraivel };

extrairTexto(pedido.bytes, pedido.tipo).then(
  (texto) => parentPort?.postMessage({ ok: true, texto }),
  (erro: unknown) =>
    parentPort?.postMessage({
      ok: false,
      extracao: erro instanceof Error && erro.name === "ErroExtracao",
      mensagem: erro instanceof Error ? erro.message : "falha desconhecida",
    }),
);
