import type { AlertaEmitido, EventoRespostaAgente } from "@zentrade/contratos";
import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { Analista } from "./analista.js";
import { ChatApi } from "./assistente/chat-api.js";
import { ChatCli } from "./assistente/chat-cli.js";
import { ServicoChat } from "./assistente/servico-chat.js";
import { AnalistaCli } from "./claude-cli/analista-cli.js";
import type { ExecucaoCli, ExecutorClaude, PedidoExecucao } from "./claude-cli/executor.js";
import {
  AnalistaComOrcamento,
  conferirUso,
  marcosAtravessados,
  MOTIVO_ORCAMENTO_MES,
  PortaoOrcamento,
  type FonteOrcamento,
  type OrigemGasto,
  type UsoOrcamento,
} from "./orcamento.js";
import { AnalistaPorPessoa } from "./provedores/analista-por-pessoa.js";
import { anthropicFalso, emStreaming, mensagemFalsa, texto } from "./teste/anthropic-falso.js";
import { investimentosFalsos } from "./teste/investimentos-falsos.js";
import { pedidoExemplo, USUARIO_TESTE } from "./teste/pedido.js";

const AGORA = Date.UTC(2026, 9, 12, 15);

const uso = (u: Partial<UsoOrcamento>): UsoOrcamento => ({
  gastoMes: dec(0),
  gastoDia: dec(0),
  limiteMensal: null,
  limiteDiario: null,
  ...u,
});

/** O livro do gasto em memória, com o mesmo contrato do banco. */
class FonteFalsa implements FonteOrcamento {
  gastos: { origem: OrigemGasto; custo: Valor }[] = [];
  falhar = false;
  constructor(
    public limiteMensal: Valor | null,
    public limiteDiario: Valor | null = null,
  ) {}
  async uso(): Promise<UsoOrcamento> {
    if (this.falhar) throw new Error("banco fora");
    const total = this.gastos.reduce((a, g) => a.plus(g.custo), dec(0));
    return {
      gastoMes: total,
      gastoDia: total,
      limiteMensal: this.limiteMensal,
      limiteDiario: this.limiteDiario,
    };
  }
  async registrar(_u: string, origem: OrigemGasto, custo: Valor): Promise<void> {
    this.gastos.push({ origem, custo });
  }
}

const log = () => ({ warn: vi.fn(), error: vi.fn() });

function portao(fonte: FonteOrcamento) {
  const alertas: AlertaEmitido[] = [];
  const l = log();
  const p = new PortaoOrcamento({
    fonte,
    log: l,
    alertar: async (a) => void alertas.push(a),
    agora: () => AGORA,
  });
  return { p, alertas, log: l };
}

const propostaValida = {
  acao: "comprar",
  confianca: 0.7,
  tamanhoRelativo: 0.5,
  justificativa: "ok",
  riscos: [],
  fontes: [],
};

const deps = () => ({
  busca: { buscar: vi.fn(async () => []) },
  historico: { recentes: vi.fn(async () => []) },
});

/** Executor do Claude Code falso: registra a chamada e devolve o "result" com custo. */
function executorFalso(custo: number, structured?: unknown) {
  const chamadas: PedidoExecucao[] = [];
  const executor = {
    executar: async (p: PedidoExecucao): Promise<ExecucaoCli> => {
      chamadas.push(p);
      p.aoLinha?.(
        JSON.stringify({
          type: "stream_event",
          event: { type: "content_block_delta", delta: { type: "text_delta", text: "resposta" } },
        }),
      );
      return {
        fim: { codigo: 0, sinal: null } as unknown as ExecucaoCli["fim"],
        resultado: {
          type: "result",
          subtype: "success",
          result: "resposta",
          ...(structured ? { structured_output: structured } : {}),
          total_cost_usd: custo,
        },
        falha: null,
        credencial: "conta",
      };
    },
  };
  return { executor: executor as unknown as ExecutorClaude, chamadas };
}

describe("orçamento de IA: regras", () => {
  it("esgota no mês ou no dia; sem limite, nunca", () => {
    expect(conferirUso(uso({ gastoMes: dec(100) }))).toEqual({ liberado: true });
    const mes = conferirUso(uso({ gastoMes: dec(10), limiteMensal: dec(10) }));
    expect(mes.liberado).toBe(false);
    expect(!mes.liberado && mes.motivo).toContain(MOTIVO_ORCAMENTO_MES);
    const dia = conferirUso(uso({ gastoDia: dec(2), limiteDiario: dec(1), limiteMensal: dec(50) }));
    expect(!dia.liberado && dia.motivo).toContain("do dia");
  });

  it("avisa ao atravessar 80% e 100%, uma vez por marco e período", () => {
    const u = uso({ gastoMes: dec("8.5"), limiteMensal: dec(10) });
    const [a80] = marcosAtravessados(USUARIO_TESTE, u, dec(1), AGORA);
    expect(a80).toMatchObject({ tipo: "orcamento_ia_80", chave: `orcamento_ia_80:${USUARIO_TESTE}:2026-10` });
    expect(marcosAtravessados(USUARIO_TESTE, u, dec("0.1"), AGORA)).toEqual([]); // já estava acima de 80%
    const salto = marcosAtravessados(
      USUARIO_TESTE,
      uso({ gastoMes: dec(12), limiteMensal: dec(10) }),
      dec(5),
      AGORA,
    );
    expect(salto.map((a) => a.tipo)).toEqual(["orcamento_ia_80", "orcamento_ia_100"]);
    const diario = marcosAtravessados(
      USUARIO_TESTE,
      uso({ gastoDia: dec(1), limiteDiario: dec(1) }),
      dec("0.5"),
      AGORA,
    );
    expect(diario.map((a) => a.chave)).toEqual([
      `orcamento_ia_80:${USUARIO_TESTE}:2026-10-12`,
      `orcamento_ia_100:${USUARIO_TESTE}:2026-10-12`,
    ]);
  });

  it("sem conseguir ler o orçamento, não libera; erro ao gravar só vai para o log", async () => {
    const fonte = new FonteFalsa(dec(10));
    fonte.falhar = true;
    const { p, log: l } = portao(fonte);
    expect((await p.conferir(USUARIO_TESTE)).liberado).toBe(false);
    await p.registrar(USUARIO_TESTE, "analise", dec(1));
    expect(l.error).toHaveBeenCalledTimes(2);
  });

  it("custo zero não grava nada", async () => {
    const fonte = new FonteFalsa(dec(10));
    await portao(fonte).p.registrar(USUARIO_TESTE, "analise", dec(0));
    expect(fonte.gastos).toEqual([]);
  });
});

describe("orçamento de IA no analista, nos dois provedores", () => {
  function montar(provedor: "api" | "cli", fonte: FonteFalsa) {
    const falso = anthropicFalso([
      mensagemFalsa({ content: [texto(JSON.stringify(propostaValida))], stop_reason: "end_turn" }),
    ]);
    const cli = executorFalso(0.02, propostaValida);
    const porPessoa = new AnalistaPorPessoa({
      api: new Analista({ cliente: falso.cliente, dependencias: deps() }),
      cli: new AnalistaCli({ executor: cli.executor, dependencias: deps(), tempoMs: 1000 }),
      config: async () => ({ provedor, modelo: null, contaCli: null }),
    });
    const { p, alertas } = portao(fonte);
    return { analista: new AnalistaComOrcamento(porPessoa, p), falso, cli, alertas };
  }

  it.each(["api", "cli"] as const)(
    "%s: sem orçamento, aguarda com o motivo e nem chama o modelo",
    async (provedor) => {
      const fonte = new FonteFalsa(dec(1));
      fonte.gastos.push({ origem: "analise", custo: dec(1) });
      const { analista, falso, cli } = montar(provedor, fonte);
      const r = await analista.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
      expect(r.semOrcamento).toBe(true);
      expect(r.proposta.acao).toBe("aguardar");
      expect(r.proposta.justificativa).toMatch(/^orçamento de IA do mês atingido/);
      expect(r.custoUsd.toFixed()).toBe("0");
      expect(falso.pedidos).toHaveLength(0);
      expect(cli.chamadas).toHaveLength(0);
    },
  );

  it.each(["api", "cli"] as const)("%s: com orçamento, analisa e grava o gasto", async (provedor) => {
    const fonte = new FonteFalsa(dec(100));
    const { analista, falso, cli } = montar(provedor, fonte);
    const r = await analista.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(r.semOrcamento).toBeUndefined();
    expect(r.proposta.acao).toBe("comprar");
    expect(fonte.gastos).toHaveLength(1);
    expect(fonte.gastos[0]?.origem).toBe("analise");
    expect(fonte.gastos[0]?.custo.toFixed()).toBe(r.custoUsd.toFixed());
    expect(r.custoUsd.gt(0)).toBe(true);
    expect(falso.pedidos.length + cli.chamadas.length).toBe(1);
  });

  it("o gasto que passa de 80% vira alerta para a dona", async () => {
    const fonte = new FonteFalsa(dec("0.021"));
    const { analista, alertas } = montar("cli", fonte);
    await analista.analisar(pedidoExemplo(), { usuarioId: USUARIO_TESTE });
    expect(alertas.map((a) => [a.tipo, a.usuarioId])).toEqual([["orcamento_ia_80", USUARIO_TESTE]]);
  });
});

describe("orçamento de IA no assistente, nos dois provedores", () => {
  function servico(provedor: "api" | "cli", fonte: FonteFalsa) {
    const falso = anthropicFalso([
      emStreaming(mensagemFalsa({ content: [texto("Tudo certo.")], stop_reason: "end_turn" })),
    ]);
    const cli = executorFalso(0.05);
    const s = new ServicoChat({
      dados: {
        resumo: vi.fn(),
        robos: vi.fn(),
        decisoes: vi.fn(),
        decisao: vi.fn(),
        ordens: vi.fn(),
        ...investimentosFalsos(),
      },
      busca: { buscar: vi.fn(async () => []) },
      config: async () => ({ provedor, modelo: null, contaCli: null }),
      api: new ChatApi({ cliente: falso.cliente }),
      cli: new ChatCli({ executor: cli.executor, tempoMs: 1000 }),
      orcamento: portao(fonte).p,
    });
    return { s, falso, cli };
  }

  const responder = async (s: ServicoChat) => {
    const eventos: EventoRespostaAgente[] = [];
    await s.responder(
      { usuarioId: USUARIO_TESTE, pergunta: "Como estou?", historico: [] },
      (e) => eventos.push(e),
      new AbortController().signal,
    );
    return eventos;
  };

  it.each(["api", "cli"] as const)("%s: sem orçamento, explica e não chama o modelo", async (provedor) => {
    const fonte = new FonteFalsa(dec(1));
    fonte.gastos.push({ origem: "assistente", custo: dec(2) });
    const { s, falso, cli } = servico(provedor, fonte);
    const eventos = await responder(s);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "erro", codigo: "orcamento_ia" });
    expect(eventos[0]?.tipo === "erro" && eventos[0].mensagem).toMatch(/orçamento de IA do mês atingido/);
    expect(falso.pedidos.length + cli.chamadas.length).toBe(0);
  });

  it.each(["api", "cli"] as const)("%s: com orçamento, responde e grava o gasto", async (provedor) => {
    const fonte = new FonteFalsa(dec(100));
    const { s } = servico(provedor, fonte);
    const eventos = await responder(s);
    expect(eventos.at(-1)?.tipo).toBe("concluido");
    expect(fonte.gastos.map((g) => g.origem)).toEqual(["assistente"]);
    expect(fonte.gastos[0]?.custo.gt(0)).toBe(true);
  });
});
