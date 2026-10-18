import type { EventoAnalise } from "@zentrade/contratos";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { observadorDaAnalise } from "../eventos/publicador.js";
import type { DependenciasFerramentas } from "../ferramentas/index.js";
import { registrarRotasPonte } from "../ponte/rotas.js";
import { SessoesPonte } from "../ponte/sessoes.js";
import { SYSTEM_PROMPT } from "../prompt.js";
import { criarClaudeFalso, resultadoCli, type ClaudeFalso } from "../teste/claude-falso.js";
import { pedidoExemplo, USUARIO_TESTE } from "../teste/pedido.js";
import { comProbabilidades, PROPOSTA_GERADA } from "../teste/proposta.js";
import { AnalistaCli, ESQUEMA_PROPOSTA, ErroClaudeCli, lerPropostaCli } from "./analista-cli.js";
import { ExecutorClaude } from "./executor.js";

const achado = {
  trechoId: "t1",
  documentoId: "doc-taxas",
  fonte: "regra_corretora" as const,
  titulo: "Taxas da corretora",
  url: null,
  publicadoEm: new Date("2026-09-01T00:00:00Z"),
  texto: "taxa de 0,1% por ordem",
  pontuacao: 0.03,
};

/** Valor esperado positivo e alta com 65%: passa pela regra dos cenários. */
const proposta = { ...PROPOSTA_GERADA, confianca: 0.6, cenarios: comProbabilidades(0.65, 0.2, 0.15) };
const torta = { ...proposta, cenarios: comProbabilidades(0.9, 0.3, 0.3) };

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

function deps(): DependenciasFerramentas {
  return { busca: { buscar: vi.fn(async () => [achado]) }, historico: { recentes: vi.fn(async () => []) } };
}

async function analista(corpo: string, extra: { contas?: string; tempoMs?: number } = {}) {
  falso = await criarClaudeFalso(corpo);
  const executor = new ExecutorClaude(
    {
      caminho: falso.caminho,
      contas: extra.contas
        ? [{ id: "pessoal", nome: "pessoal", pasta: extra.contas }]
        : [{ id: "padrao", nome: "padrão", pasta: null }],
      urlAgente: url,
      caminhoPonte: "/app/dist/ponte/bin.js",
      maxTurnos: 6,
      tetoUsd: 0.25,
      env: { PATH: process.env["PATH"], HOME: "/home/zt", ANTHROPIC_API_KEY: "sk-ant-nao-pode-vazar" },
    },
    sessoes,
  );
  const dependencias = deps();
  const a = new AnalistaCli({
    executor,
    dependencias,
    tempoMs: extra.tempoMs ?? 10_000,
    agora: () => new Date("2026-10-10T12:00:00Z"),
  });
  return { a, dependencias };
}

describe("AnalistaCli (claude -p de mentira, ponte de verdade)", () => {
  it("usa as ferramentas pela ponte, publica as etapas e devolve a proposta validada", async () => {
    const { a, dependencias } = await analista(`
      await ferramenta("retrato_mercado", {});
      const busca = await ferramenta("buscar_conhecimento", { consulta: "taxa" });
      if (!busca.ok) throw new Error("ponte falhou");
      sair(${JSON.stringify(resultadoCli({ structured_output: proposta }))});`);
    const eventos: EventoAnalise[] = [];
    const aoUsarFerramenta = observadorDaAnalise({
      analiseId: "an-1",
      roboId: "robo-1",
      publicador: { publicar: async (e) => void eventos.push(e) },
    });
    const r = await a.analisar(pedidoExemplo(), {
      usuarioId: USUARIO_TESTE,
      modelo: "sonnet",
      aoUsarFerramenta: aoUsarFerramenta!,
    });
    expect(r.proposta).toMatchObject(proposta);
    expect(r.proposta.avaliacao).toMatchObject({ aplicada: true, aprovada: true });
    expect(r.custoUsd.toFixed()).toBe("0.0123");
    expect(eventos.map((e) => e.etapa?.ferramenta)).toEqual(["retrato_mercado", "buscar_conhecimento"]);
    expect(eventos[1]!.etapa?.descricao).toMatch(/taxa/);
    expect(dependencias.busca.buscar).toHaveBeenCalledWith(
      "taxa",
      expect.objectContaining({ usuarioId: USUARIO_TESTE }),
    );
    expect(sessoes.abertas).toBe(0);
  });

  it("monta o comando travado, com o esquema, o modelo, o prompt e a conta certa", async () => {
    const { a } = await analista(
      `sair(${JSON.stringify(resultadoCli({ structured_output: { ...proposta, fontes: [] } }))});`,
      {
        contas: "/dados/claude/pessoal",
      },
    );
    await a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE, modelo: "opus", contaCli: "pessoal" });
    const recebido = await falso!.recebido();
    const valor = (f: string) => recebido.args[recebido.args.indexOf(f) + 1];
    expect(JSON.parse(valor("--json-schema")!)).toEqual(ESQUEMA_PROPOSTA);
    expect(valor("--model")).toBe("opus");
    expect(valor("--tools")).toBe("");
    expect(recebido.instrucoes).toBe(SYSTEM_PROMPT);
    expect(recebido.entrada).toContain("BTCUSDT");
    expect(recebido.entrada).toContain("America/Sao_Paulo; UTC 2026-10-10T12:00Z");
    expect(JSON.stringify(ESQUEMA_PROPOSTA)).toContain("cenarios");
    expect(recebido.env["CLAUDE_CONFIG_DIR"]).toBe("/dados/claude/pessoal");
    expect(recebido.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    const ponte = recebido.mcp.mcpServers["zentrade"]!;
    expect(ponte.command).toBe(process.execPath);
    expect(ponte.env["ZT_PONTE_URL"]).toBe(`${url}/ponte/ferramentas`);
    expect(recebido.args.join(" ")).not.toContain(ponte.env["ZT_PONTE_ACESSO"]!);
  });

  it("fora do esquema: nova tentativa com o erro na entrada; a segunda vale e o custo soma", async () => {
    const { a } = await analista(`
      const r = entrada.includes("## Correção")
        ? ${JSON.stringify(resultadoCli({ structured_output: proposta }))}
        : ${JSON.stringify(resultadoCli({ structured_output: torta }))};
      sair(r);`);
    const r = await a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(r.proposta.acao).toBe("comprar");
    expect(r.custoUsd.toFixed()).toBe("0.0246");
    const recebido = await falso!.recebido();
    expect(recebido.entrada).toMatch(/## Correção/);
    expect(recebido.entrada).toMatch(/somar 1/);
  });

  it("fora do esquema duas vezes ou parada por limite viram 'aguardar' com o motivo", async () => {
    const { a } = await analista(
      `sair(${JSON.stringify(resultadoCli({ structured_output: { acao: "comprar" } }))});`,
    );
    const r = await a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(r.proposta).toMatchObject({ acao: "aguardar", confianca: 0, tamanhoRelativo: 0 });
    expect(r.proposta.justificativa).toMatch(/fora do formato duas vezes/);
    await falso!.apagar();
    const { a: a2 } = await analista(
      `sair(${JSON.stringify(resultadoCli({ subtype: "error_max_turns", is_error: true }))}, 1);`,
    );
    expect((await a2.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE })).proposta.justificativa).toMatch(
      /voltas/,
    );
  });

  it("CLI sem login vira erro (o motor não opera), não proposta", async () => {
    const { a } = await analista(
      `process.stderr.write("Invalid API key · Please run /login\\n"); process.exitCode = 1;`,
    );
    await expect(a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE })).rejects.toMatchObject({
      codigo: "autenticacao",
    });
  });

  it("prazo estourado vira erro de tempo e a sessão da ponte fecha", async () => {
    const { a } = await analista("await new Promise((r) => setTimeout(r, 30_000));", { tempoMs: 300 });
    await expect(a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE })).rejects.toBeInstanceOf(
      ErroClaudeCli,
    );
    expect(sessoes.abertas).toBe(0);
  });

  it("conta que não existe mais é erro antes de rodar", async () => {
    const { a } = await analista("sair({})");
    await expect(
      a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE, contaCli: "sumiu" }),
    ).rejects.toThrow(/não existe mais/);
  });
});

describe("lerPropostaCli", () => {
  it("sem resultado, com erro, teto de custo ou sem saída estruturada: recusa sem nova tentativa", () => {
    const motivo = (r: Parameters<typeof lerPropostaCli>[0]) => {
      const l = lerPropostaCli(r);
      return l.ok ? "" : `${l.motivo}${l.erroDeFormato === undefined ? "" : " [retenta]"}`;
    };
    expect(motivo(null)).toMatch(/legível/);
    expect(motivo({ type: "result", subtype: "error_max_budget_usd" })).toMatch(/teto/);
    expect(motivo({ type: "result", subtype: "error_during_execution" })).toMatch(/error_during_execution/);
    expect(motivo({ type: "result", subtype: "error_max_structured_output_retries" })).toMatch(/formato/);
    expect(motivo({ type: "result", subtype: "error_max_budget_usd" })).not.toMatch(/retenta/);
  });

  it("aceita a proposta no texto do result quando não vem saída estruturada", () => {
    const l = lerPropostaCli({ type: "result", subtype: "success", result: JSON.stringify(proposta) });
    expect(l.ok && l.proposta.acao).toBe("comprar");
  });

  it("fora do esquema (soma das probabilidades): recusa com o erro, para a nova tentativa", () => {
    const l = lerPropostaCli({ type: "result", subtype: "success", structured_output: torta });
    expect(l.ok).toBe(false);
    if (!l.ok) expect(l.erroDeFormato).toMatch(/somar 1/);
  });
});
