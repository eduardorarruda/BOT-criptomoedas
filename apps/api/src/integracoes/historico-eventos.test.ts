import type { Evento } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import {
  armazemHistoricoMemoria,
  armazemHistoricoRedis,
  CHAVE_HISTORICO,
  criarHistoricoEventos,
  roboDoEvento,
  type ArmazemHistorico,
} from "./historico-eventos.js";

const R1 = "r1";
const decisao = (id: string, roboId = R1) =>
  ({
    tipo: "decisao",
    decisao: {
      id,
      roboId,
      em: 1,
      sinal: { acao: "COMPRAR", explicacao: "x" },
      preco: "100",
      risco: { aprovada: true, barreiras: [] },
      estado: "aprovada",
    },
  }) satisfies Evento;
const ordem = (decisaoId: string) =>
  ({
    tipo: "ordem",
    ordem: {
      id: "o1",
      decisaoId,
      idCliente: "zt-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: "0.1",
      estado: "PENDENTE",
      criadaEm: 1,
      execucoes: [],
    },
  }) satisfies Evento;
const sinal = (em: number, roboId = R1): Evento => ({
  tipo: "sinal",
  roboId,
  acao: "AGUARDAR",
  explicacao: "nada",
  preco: "1",
  em,
});

function montar(o: {
  armazem?: ArmazemHistorico;
  teto?: number;
  roboDaDecisao?: () => Promise<string | null>;
  roboConhecido?: (roboId: string) => Promise<boolean>;
}) {
  let t = 1000;
  const log = { warn: vi.fn(), error: vi.fn() };
  const historico = criarHistoricoEventos({
    armazem: o.armazem ?? armazemHistoricoMemoria(),
    agora: () => t++,
    log,
    roboDaDecisao: o.roboDaDecisao ?? (() => Promise.resolve(null)),
    ...(o.roboConhecido ? { roboConhecido: o.roboConhecido } : {}),
    ...(o.teto ? { teto: o.teto } : {}),
  });
  return { historico, log };
}

describe("histórico de eventos ao vivo", () => {
  it("sabe de que robô é cada evento; preço e saúde não são de robô nenhum", () => {
    expect(roboDoEvento(sinal(1))).toBe(R1);
    expect(roboDoEvento(decisao("d1", "r9"))).toBe("r9");
    expect(roboDoEvento({ tipo: "preco", simbolo: "BTCUSDT", preco: "1", em: 1 })).toBeNull();
    expect(roboDoEvento({ tipo: "saude", servico: "motor", ok: true, em: 1 })).toBeNull();
    expect(roboDoEvento(ordem("d1"))).toBeUndefined(); // precisa descobrir pela decisão
  });

  it("guarda por robô, do mais antigo ao mais novo, com a hora em que chegou", async () => {
    const { historico } = montar({});
    await historico.guardar(sinal(1));
    await historico.guardar(sinal(2));
    await historico.guardar(sinal(3, "r2"));
    await historico.guardar({ tipo: "preco", simbolo: "BTCUSDT", preco: "1", em: 1 });
    const r1 = await historico.recentes(R1);
    expect(r1.map((r) => (r.evento.tipo === "sinal" ? r.evento.em : 0))).toEqual([1, 2]);
    expect(r1.map((r) => r.recebidoEm)).toEqual([1000, 1001]);
    expect(await historico.recentes("r2")).toHaveLength(1);
    expect(await historico.recentes("nenhum")).toEqual([]);
  });

  it("respeita o teto (os mais velhos saem) e o limite pedido", async () => {
    const { historico } = montar({ teto: 3 });
    for (let i = 1; i <= 5; i++) await historico.guardar(sinal(i));
    const todos = await historico.recentes(R1);
    expect(todos.map((r) => (r.evento.tipo === "sinal" ? r.evento.em : 0))).toEqual([3, 4, 5]);
    expect(await historico.recentes(R1, 2)).toHaveLength(2);
  });

  it("ordem vai para o robô da decisão: lembrado do evento da decisão ou perguntado ao banco", async () => {
    const roboDaDecisao = vi.fn(() => Promise.resolve("r7"));
    const { historico } = montar({ roboDaDecisao });
    await historico.guardar(decisao("d1"));
    await historico.guardar(ordem("d1"));
    expect((await historico.recentes(R1)).map((r) => r.evento.tipo)).toEqual(["decisao", "ordem"]);
    expect(roboDaDecisao).not.toHaveBeenCalled();
    await historico.guardar(ordem("d-velha"));
    expect(roboDaDecisao).toHaveBeenCalledWith("d-velha");
    expect(await historico.recentes("r7")).toHaveLength(1);
  });

  it("grava na ordem de chegada, mesmo quando descobrir o robô demora", async () => {
    let soltar: ((r: string | null) => void) | null = null;
    const roboDaDecisao = () => new Promise<string | null>((r) => (soltar = r));
    const { historico } = montar({ roboDaDecisao });
    const primeiro = historico.guardar(ordem("d-velha"));
    const segundo = historico.guardar(sinal(9));
    await vi.waitFor(() => expect(soltar).not.toBeNull());
    soltar!(R1);
    await Promise.all([primeiro, segundo]);
    expect((await historico.recentes(R1)).map((r) => r.evento.tipo)).toEqual(["ordem", "sinal"]);
  });

  it("robô que não é deste banco não entra (outra API no mesmo canal e no mesmo Redis)", async () => {
    const roboConhecido = vi.fn((id: string) => Promise.resolve(id === "r1"));
    const { historico } = montar({ roboConhecido });
    await historico.guardar(sinal(1, "r1"));
    await historico.guardar(sinal(2, "r-de-outro"));
    await historico.guardar(sinal(3, "r1"));
    expect((await historico.recentes("r1")).map((r) => r.evento.tipo)).toEqual(["sinal", "sinal"]);
    expect(await historico.recentes("r-de-outro")).toEqual([]);
    // Robô conhecido fica lembrado: o banco não é consultado a cada evento.
    expect(roboConhecido.mock.calls.filter(([id]) => id === "r1")).toHaveLength(1);
  });

  it("ordem de decisão desconhecida não é guardada (nem em robô errado)", async () => {
    const { historico } = montar({});
    await historico.guardar(ordem("sumiu"));
    expect(await historico.recentes(R1)).toEqual([]);
  });

  it("armazém fora do ar: guardar registra e não lança; ler falha com erro claro", async () => {
    const quebrado: ArmazemHistorico = {
      empilhar: () => Promise.reject(new Error("redis fora")),
      ler: () => Promise.reject(new Error("redis fora")),
      definir: () => Promise.reject(new Error("redis fora")),
      obter: () => Promise.reject(new Error("redis fora")),
    };
    const { historico, log } = montar({ armazem: quebrado });
    await expect(historico.guardar(sinal(1))).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
    await expect(historico.recentes(R1)).rejects.toThrow(/redis fora/);
  });

  it("linha corrompida no armazém é pulada, não derruba a leitura", async () => {
    const armazem = armazemHistoricoMemoria();
    const { historico, log } = montar({ armazem });
    await historico.guardar(sinal(1));
    await armazem.empilhar(`${CHAVE_HISTORICO}${R1}`, "{quebrado", 10, 60);
    await armazem.empilhar(`${CHAVE_HISTORICO}${R1}`, JSON.stringify({ recebidoEm: 1, evento: {} }), 10, 60);
    expect(await historico.recentes(R1)).toHaveLength(1);
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("armazém no Redis", () => {
  it("empilha numa lista com teto e validade, numa transação só", async () => {
    const comandos: unknown[][] = [];
    const multi = {
      lpush: (...a: unknown[]) => (comandos.push(["lpush", ...a]), multi),
      ltrim: (...a: unknown[]) => (comandos.push(["ltrim", ...a]), multi),
      expire: (...a: unknown[]) => (comandos.push(["expire", ...a]), multi),
      exec: () => Promise.resolve([]),
    };
    const redis = {
      multi: () => multi,
      lrange: vi.fn(() => Promise.resolve(["b", "a"])),
      set: vi.fn(() => Promise.resolve("OK")),
      get: vi.fn(() => Promise.resolve("r1")),
    };
    const a = armazemHistoricoRedis(redis);
    await a.empilhar("k", "x", 50, 60);
    expect(comandos).toEqual([
      ["lpush", "k", "x"],
      ["ltrim", "k", 0, 49],
      ["expire", "k", 60],
    ]);
    expect(await a.ler("k", 2)).toEqual(["b", "a"]);
    expect(redis.lrange).toHaveBeenCalledWith("k", 0, 1);
    await a.definir("d", "r1", 60);
    expect(redis.set).toHaveBeenCalledWith("d", "r1", "EX", 60);
    expect(await a.obter("d")).toBe("r1");
  });

  it("transação que falha vira erro", async () => {
    const multi = {
      lpush: () => multi,
      ltrim: () => multi,
      expire: () => multi,
      exec: () => Promise.resolve([[new Error("OOM"), null] as [Error | null, unknown]]),
    };
    const redis = {
      multi: () => multi,
      lrange: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
    };
    await expect(armazemHistoricoRedis(redis).empilhar("k", "x", 1, 1)).rejects.toThrow(/OOM/);
  });
});
