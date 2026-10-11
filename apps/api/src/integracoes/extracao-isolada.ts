import { Worker } from "node:worker_threads";
import { ErroExtracao, extrairTexto, type TextoExtraido, type TipoExtraivel } from "@zentrade/conhecimento";

/**
 * Extrai o texto de PDF, DOCX e HTML numa worker thread, com teto de memória e de
 * tempo. Um arquivo hostil (zip bomb num .docx, PDF que faz o parser girar) derruba só
 * a thread — nunca a API que atende todas as pessoas. MD e TXT não descompactam nada e
 * ficam no próprio processo.
 */
export interface OpcoesIsolamento {
  readonly timeoutMs?: number;
  readonly memoriaMb?: number;
  /** Só para teste: outro script de trabalhador. */
  readonly arquivo?: URL;
}

const TRABALHADOR = new URL(
  import.meta.url.endsWith(".ts") ? "./extracao-trabalhador.ts" : "./extracao-trabalhador.js",
  import.meta.url,
);

type Resposta = { ok: true; texto: TextoExtraido } | { ok: false; extracao: boolean; mensagem: string };

const falhaGenerica = () =>
  new ErroExtracao("Não deu para ler este arquivo. Confira se ele abre normalmente e envie de novo.");

export function extrairIsolado(
  bytes: Uint8Array,
  tipo: TipoExtraivel,
  o: OpcoesIsolamento = {},
): Promise<TextoExtraido> {
  if (tipo === "md" || tipo === "txt") return extrairTexto(bytes, tipo);
  const timeoutMs = o.timeoutMs ?? 30_000;
  return new Promise<TextoExtraido>((resolver, rejeitar) => {
    const trabalhador = new Worker(o.arquivo ?? TRABALHADOR, {
      workerData: { bytes, tipo },
      resourceLimits: { maxOldGenerationSizeMb: o.memoriaMb ?? 256, maxYoungGenerationSizeMb: 32 },
    });
    let acabou = false;
    const terminar = (acao: () => void) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(prazo);
      void trabalhador.terminate();
      acao();
    };
    const prazo = setTimeout(
      () =>
        terminar(() =>
          rejeitar(
            new ErroExtracao(
              "A leitura deste arquivo demorou demais. Salve como PDF simples ou divida o arquivo.",
            ),
          ),
        ),
      timeoutMs,
    );
    trabalhador.on("message", (r: Resposta) =>
      terminar(() =>
        r.ok ? resolver(r.texto) : rejeitar(r.extracao ? new ErroExtracao(r.mensagem) : falhaGenerica()),
      ),
    );
    trabalhador.on("error", (erro: Error & { code?: string }) =>
      terminar(() =>
        rejeitar(
          erro.code === "ERR_WORKER_OUT_OF_MEMORY"
            ? new ErroExtracao(
                "Este arquivo usa memória demais ao ser aberto (descompactado é enorme). Salve como PDF ou divida o documento.",
              )
            : falhaGenerica(),
        ),
      ),
    );
    trabalhador.on("exit", () => terminar(() => rejeitar(falhaGenerica())));
  });
}
