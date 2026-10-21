import type { PedidoAnalise, PortaAgente, PropostaAgente, RespostaAnalise } from "@zentrade/contratos";
import { dec, POSICAO_ZERADA } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import type { AnaliseReplay, NovaAnaliseReplay } from "@zentrade/banco";
import { aprovouEntrada, executarReplay, type Armazem, type OpcoesExecucao } from "./executar.js";
import type { SinalReplay } from "./sinais.js";

const HORA = 3_600_000;
const BASE = Date.parse("2026-07-02T00:00:00Z");

const sinalEm = (i: number, simbolo = "BTCUSDT"): SinalReplay => ({
  simbolo,
  indice: i,
  ate: BASE + i * HORA,
  preco: dec(100),
  sinal: { acao: "COMPRAR", stop: dec(95), alvo: dec(160), explicacao: "rompimento" },
  desfecho: { situacao: "pendente", barras: 0 },
});

const proposta = (
  acao: PropostaAgente["acao"],
  aprovada: boolean,
  extra: Partial<PropostaAgente> = {},
): PropostaAgente => ({
  acao,
  confianca: 0.5,
  tamanhoRelativo: 1,
  justificativa: "teste",
  riscos: [],
  fontes: [],
  cenarios: [] as never,
  avaliacao: {
    aplicada: true,
    aprovada,
    motivo: "x",
    valorEsperado: 1,
    favoravel: "alta",
    probabilidadeFavoravel: 0.5,
    limiar: 0.3,
  },
  ...extra,
});

function armazemEmMemoria(inicial: AnaliseReplay[] = []): Armazem & { linhas: NovaAnaliseReplay[] } {
  const linhas: NovaAnaliseReplay[] = [];
  return {
    linhas,
    gravar: async (a) => void linhas.push(a),
    listar: async () => [
      ...inicial,
      ...linhas.map((l) => ({ ...l, preco: l.preco, custoIaUsd: l.custoIaUsd })),
    ],
    custoTotal: async () => [...inicial, ...linhas].reduce((s, a) => s.plus(a.custoIaUsd), dec(0)),
  };
}

const OPCOES: OpcoesExecucao = {
  execucao: "teste",
  maximo: 200,
  custoMaximoUsd: 15,
  confirmar: true,
  paralelo: 1,
  custoEstimadoPorAnaliseUsd: 0.4,
  falhasSeguidasMaximas: 3,
};

function agenteDe(
  resposta: (p: PedidoAnalise, n: number) => RespostaAnalise | Error,
): PortaAgente & { pedidos: PedidoAnalise[] } {
  const pedidos: PedidoAnalise[] = [];
  return {
    pedidos,
    analisar: async (p) => {
      pedidos.push(p);
      const r = resposta(p, pedidos.length);
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const ok = (acao: "comprar" | "aguardar", custo = "0.4"): RespostaAnalise => ({
  proposta: proposta(acao, acao === "comprar"),
  custoUsd: dec(custo),
});

function montar(
  sinais: SinalReplay[],
  agente: PortaAgente,
  armazem: Armazem,
  o: Partial<OpcoesExecucao> = {},
) {
  const linhas: string[] = [];
  const pedidoDe = vi.fn((s: SinalReplay): PedidoAnalise => ({
    robo: { id: "replay-x", simbolo: s.simbolo, intervalo: "1h" },
    sinal: s.sinal,
    preco: s.preco,
    fechamentos: [100],
    posicao: POSICAO_ZERADA,
    ate: s.ate,
  }));
  const resumo = executarReplay(
    sinais,
    { ...OPCOES, ...o },
    { agente, armazem, pedidoDe, escrever: (l) => linhas.push(l) },
  );
  return { resumo, linhas, pedidoDe };
}

describe("aprovação do Claude no replay", () => {
  it("comprar com a regra dos cenários aprovada, sem veto grave", () => {
    expect(aprovouEntrada(proposta("comprar", true))).toBe(true);
    expect(aprovouEntrada(proposta("comprar", false))).toBe(false);
    expect(aprovouEntrada(proposta("aguardar", true))).toBe(false);
    expect(aprovouEntrada(proposta("comprar", true, { vetoGrave: "notícia" }))).toBe(false);
  });
});

describe("execução do replay", () => {
  const sinais = [sinalEm(5), sinalEm(1), sinalEm(3, "ETHUSDT"), sinalEm(2)];

  it("sem --confirmar só estima: nenhum pedido ao agente, nada gravado", async () => {
    const agente = agenteDe(() => ok("comprar"));
    const armazem = armazemEmMemoria();
    const { resumo, linhas } = montar(sinais, agente, armazem, { confirmar: false });
    expect(await resumo).toMatchObject({
      parou: "sem_confirmacao",
      analisadosAgora: 0,
      selecionados: 4,
      estimativaUsd: 1.6,
    });
    expect(agente.pedidos).toHaveLength(0);
    expect(armazem.linhas).toHaveLength(0);
    expect(linhas.join("\n")).toMatch(/--confirmar/);
  });

  it("analisa em ordem cronológica até o máximo e conta os que sobraram", async () => {
    const agente = agenteDe((_, n) => ok(n % 2 === 1 ? "comprar" : "aguardar"));
    const armazem = armazemEmMemoria();
    const { resumo } = montar(sinais, agente, armazem, { maximo: 3 });
    expect(await resumo).toMatchObject({
      analisadosAgora: 3,
      sobraram: 1,
      sinaisNaJanela: 4,
      parou: "concluido",
    });
    expect(agente.pedidos.map((p) => p.ate)).toEqual([sinalEm(1).ate, sinalEm(2).ate, sinalEm(3).ate]);
    expect(armazem.linhas.map((l) => l.veredito)).toEqual(["aprovou", "vetou", "aprovou"]);
    expect(armazem.linhas[0]?.sinal).toMatchObject({ acao: "COMPRAR", stop: "95", alvo: "160" });
  });

  it("retoma sem repetir: análises já gravadas não vão de novo ao agente", async () => {
    const feita = { ...sinalEm(1), execucao: "teste" };
    const antes: AnaliseReplay = {
      execucao: "teste",
      simbolo: feita.simbolo,
      sinalEm: feita.ate,
      preco: feita.preco,
      sinal: {},
      proposta: {},
      veredito: "vetou",
      custoIaUsd: dec("0.4"),
    };
    const agente = agenteDe(() => ok("aguardar"));
    const { resumo } = montar(sinais, agente, armazemEmMemoria([antes]));
    expect(await resumo).toMatchObject({
      jaAnalisados: 1,
      analisadosAgora: 3,
      custoTotalUsd: expect.closeTo(1.6, 5),
    });
    expect(agente.pedidos).toHaveLength(3);
  });

  it("para ao atingir o teto de custo", async () => {
    const agente = agenteDe(() => ok("aguardar", "2"));
    const { resumo } = montar(sinais, agente, armazemEmMemoria(), { custoMaximoUsd: 3 });
    const r = await resumo;
    expect(r.parou).toBe("teto_de_custo");
    expect(r.analisadosAgora).toBe(2);
    expect(r.custoDestaRodadaUsd).toBeCloseTo(4);
  });

  it("para depois de falhas seguidas e não grava nada delas", async () => {
    const agente = agenteDe(() => new Error("agente fora do ar"));
    const armazem = armazemEmMemoria();
    const { resumo, linhas } = montar([...sinais, sinalEm(9), sinalEm(10)], agente, armazem);
    expect(await resumo).toMatchObject({ parou: "falhas_seguidas", falhas: 3, analisadosAgora: 0 });
    expect(armazem.linhas).toHaveLength(0);
    expect(linhas.join("\n")).toMatch(/FALHOU/);
  });

  it("proposta sem cenários (fallback de segurança do agente) é falha, não veto", async () => {
    const agente = agenteDe(() => ({
      proposta: { ...proposta("aguardar", false), cenarios: undefined },
      custoUsd: dec("0.1"),
    }));
    const armazem = armazemEmMemoria();
    const { resumo } = montar(sinais.slice(0, 1), agente, armazem);
    expect(await resumo).toMatchObject({ falhas: 1, analisadosAgora: 0 });
    expect(armazem.linhas).toHaveLength(0);
  });

  it("sem orçamento de IA, para na hora", async () => {
    const agente = agenteDe(() => ({
      proposta: proposta("aguardar", false),
      custoUsd: dec(0),
      semOrcamento: true,
    }));
    const { resumo } = montar(sinais, agente, armazemEmMemoria());
    expect(await resumo).toMatchObject({ parou: "sem_orcamento", analisadosAgora: 0 });
  });

  it("com análises em paralelo, termina todas e não duplica", async () => {
    const agente = agenteDe(() => ok("comprar"));
    const armazem = armazemEmMemoria();
    const { resumo } = montar(sinais, agente, armazem, { paralelo: 3 });
    expect((await resumo).analisadosAgora).toBe(4);
    expect(new Set(armazem.linhas.map((l) => `${l.simbolo}|${l.sinalEm}`)).size).toBe(4);
  });
});
