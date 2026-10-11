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
import { AnalistaCli, ESQUEMA_PROPOSTA, ErroClaudeCli, propostaDoResultado } from "./analista-cli.js";
import { ExecutorClaude } from "./executor.js";
import { RegistroFontes } from "../ferramentas/registro.js";

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

const proposta = {
  acao: "comprar",
  confianca: 0.7,
  tamanhoRelativo: 0.5,
  stop: "58800",
  alvo: "61000",
  justificativa: "Preço abaixo da média; a taxa cabe no alvo.",
  riscos: ["mercado em queda"],
  fontes: [{ tipo: "regra_corretora", id: "doc-taxas", titulo: "Taxas da corretora", data: "2026-09-01" }],
};

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
    expect(r.proposta).toEqual(proposta);
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
    expect(recebido.env["CLAUDE_CONFIG_DIR"]).toBe("/dados/claude/pessoal");
    expect(recebido.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    const ponte = recebido.mcp.mcpServers["zentrade"]!;
    expect(ponte.command).toBe(process.execPath);
    expect(ponte.env["ZT_PONTE_URL"]).toBe(`${url}/ponte/ferramentas`);
    expect(recebido.args.join(" ")).not.toContain(ponte.env["ZT_PONTE_ACESSO"]!);
  });

  it("saída fora do esquema ou parada por limite viram 'aguardar' com o motivo", async () => {
    const { a } = await analista(
      `sair(${JSON.stringify(resultadoCli({ structured_output: { acao: "comprar" } }))});`,
    );
    const r = await a.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(r.proposta).toMatchObject({ acao: "aguardar", confianca: 0, tamanhoRelativo: 0 });
    expect(r.proposta.justificativa).toMatch(/fora do esquema/);
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

describe("propostaDoResultado", () => {
  const registro = new RegistroFontes();
  it("sem resultado, com erro, teto de custo ou sem saída estruturada: aguardar", () => {
    expect(propostaDoResultado(null, registro).justificativa).toMatch(/legível/);
    expect(
      propostaDoResultado({ type: "result", subtype: "error_max_budget_usd" }, registro).justificativa,
    ).toMatch(/teto/);
    expect(
      propostaDoResultado({ type: "result", subtype: "error_during_execution" }, registro).justificativa,
    ).toMatch(/error_during_execution/);
    expect(
      propostaDoResultado({ type: "result", subtype: "error_max_structured_output_retries" }, registro)
        .justificativa,
    ).toMatch(/formato/);
  });

  it("aceita a proposta no texto do result quando não vem saída estruturada e descarta fonte inventada", () => {
    const p = propostaDoResultado(
      { type: "result", subtype: "success", result: JSON.stringify(proposta) },
      registro,
    );
    expect(p.acao).toBe("comprar");
    expect(p.fontes).toEqual([]);
    expect(p.riscos.at(-1)).toMatch(/1 fonte/);
  });
});
