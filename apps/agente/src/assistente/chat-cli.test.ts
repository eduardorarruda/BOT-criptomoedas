import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ExecutorClaude } from "../claude-cli/executor.js";
import { definirFerramenta } from "../ferramentas/index.js";
import { registrarRotasPonte } from "../ponte/rotas.js";
import { SessoesPonte } from "../ponte/sessoes.js";
import { criarClaudeFalso, resultadoCli, type ClaudeFalso } from "../teste/claude-falso.js";
import { ChatCli, criarLeitorTexto } from "./chat-cli.js";
import { SYSTEM_CHAT } from "./prompt-chat.js";

const parcial = (evento: object) => ({ type: "stream_event", event: evento });
const inicioTexto = parcial({
  type: "content_block_start",
  index: 0,
  content_block: { type: "text", text: "" },
});
const pedaco = (t: string) =>
  parcial({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } });

describe("criarLeitorTexto (stream-json do Claude Code)", () => {
  it("junta os pedaços e separa blocos de texto com linha em branco", () => {
    const saida: string[] = [];
    const l = criarLeitorTexto((d) => saida.push(d));
    for (const o of [
      inicioTexto,
      pedaco("Olá"),
      pedaco(", tudo bem?"),
      { type: "assistant" },
      inicioTexto,
      pedaco("Segundo"),
    ]) {
      l.linha(JSON.stringify(o));
    }
    l.linha("não é json");
    l.linha(
      JSON.stringify(
        parcial({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } }),
      ),
    );
    l.fim("ignorado");
    expect(saida.join("")).toBe("Olá, tudo bem?\n\nSegundo");
    expect(l.escreveu).toBe(true);
  });

  it("sem pedaços parciais, usa o texto final", () => {
    const saida: string[] = [];
    const l = criarLeitorTexto((d) => saida.push(d));
    l.fim("Resposta inteira");
    l.fim(undefined);
    expect(saida).toEqual(["Resposta inteira"]);
  });
});

let app: FastifyInstance;
let url: string;
const sessoes = new SessoesPonte();
let falso: ClaudeFalso | undefined;
beforeAll(async () => {
  app = Fastify({ logger: false });
  registrarRotasPonte(app, sessoes, app.log);
  url = await app.listen({ host: "127.0.0.1", port: 0 });
});
afterAll(async () => app.close());
afterEach(async () => falso?.apagar());

const resumo = definirFerramenta({
  nome: "resumo_da_conta",
  descricao: "x",
  entrada: z.object({}),
  rodar: () => '{"ok":true}',
});

async function chat(corpo: string) {
  falso = await criarClaudeFalso(corpo);
  const executor = new ExecutorClaude(
    {
      caminho: falso.caminho,
      contas: [{ id: "padrao", nome: "p", pasta: null }],
      urlAgente: url,
      caminhoPonte: "/x.js",
      maxTurnos: 5,
      tetoUsd: 1,
      env: { PATH: process.env["PATH"] },
    },
    sessoes,
  );
  const textos: string[] = [];
  const responder = () =>
    new ChatCli({ executor, tempoMs: 10_000, agora: () => new Date("2026-10-10T12:00:00Z") }).responder({
      historico: [{ papel: "usuario", texto: "oi" }],
      pergunta: "Como estão os robôs?",
      ferramentas: [resumo],
      modelo: null,
      contaId: null,
      sinal: new AbortController().signal,
      aoTexto: (d) => textos.push(d),
    });
  return { responder, textos };
}

describe("ChatCli (claude -p de mentira)", () => {
  it("transmite o texto do stream-json e usa as ferramentas pela ponte", async () => {
    const { responder, textos } = await chat(`
      const r = await ferramenta("resumo_da_conta", {});
      linha(${JSON.stringify(inicioTexto)});
      linha(${JSON.stringify(pedaco("Tudo "))});
      linha(${JSON.stringify(pedaco("certo."))});
      linha(r.ok ? ${JSON.stringify(resultadoCli({ result: "Tudo certo." }))} : {});`);
    await responder();
    expect(textos.join("")).toBe("Tudo certo.");
    const recebido = await falso!.recebido();
    expect(recebido.args[recebido.args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(recebido.instrucoes).toBe(SYSTEM_CHAT);
    expect(recebido.entrada).toMatch(
      /\[Pessoa\]\noi[\s\S]*Pergunta atual da pessoa:\n\nComo estão os robôs\?/,
    );
  });

  it("parada por limite de voltas e falha do processo viram erro", async () => {
    const { responder } = await chat(
      `sair(${JSON.stringify(resultadoCli({ subtype: "error_max_turns", is_error: true }))});`,
    );
    await expect(responder()).rejects.toThrow(/limite de consultas/);
    await falso!.apagar();
    const { responder: r2 } = await chat(`process.stderr.write("boom"); process.exitCode = 2;`);
    await expect(r2()).rejects.toThrow(/código 2/);
  });
});
