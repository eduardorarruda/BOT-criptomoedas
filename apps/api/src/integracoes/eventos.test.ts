import type { Evento } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { criarHubEventos } from "./eventos.js";

const log = { warn: vi.fn(), error: vi.fn() };
const donos = {
  donoDoRobo: vi.fn(async (id: string) => (id === "robo-ana" ? "ana" : null)),
  donoDaDecisao: vi.fn(async (id: string) => (id === "dec-ana" ? "ana" : null)),
};

const risco = (roboId: string): Evento => ({
  tipo: "risco",
  roboId,
  barreira: { codigo: "pausado", mensagem: "parada" },
  em: 1,
});

describe("hub de eventos ao vivo", () => {
  it("entrega evento de robô só para a dona", async () => {
    const hub = criarHubEventos({ donos, log });
    const ana = vi.fn();
    const beto = vi.fn();
    hub.registrar("ana", ana);
    hub.registrar("beto", beto);
    await hub.receber(JSON.stringify(risco("robo-ana")));
    expect(ana).toHaveBeenCalledOnce();
    expect(JSON.parse(ana.mock.calls[0]![0] as string)).toMatchObject({ tipo: "risco", roboId: "robo-ana" });
    expect(beto).not.toHaveBeenCalled();
  });

  it("preço e saúde vão para todo mundo conectado", async () => {
    const hub = criarHubEventos({ donos, log });
    const ana = vi.fn();
    const beto = vi.fn();
    hub.registrar("ana", ana);
    hub.registrar("beto", beto);
    await hub.receber(JSON.stringify({ tipo: "preco", simbolo: "BTCUSDT", preco: "1", em: 1 }));
    expect(ana).toHaveBeenCalledOnce();
    expect(beto).toHaveBeenCalledOnce();
  });

  it("ordem chega à dona pela decisão; dona desconhecida não recebe nada", async () => {
    const hub = criarHubEventos({ donos, log });
    const ana = vi.fn();
    hub.registrar("ana", ana);
    const ordem = {
      id: "o1",
      decisaoId: "dec-ana",
      idCliente: "zt-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: "1",
      estado: "PENDENTE",
      criadaEm: 1,
      execucoes: [],
    };
    await hub.receber(JSON.stringify({ tipo: "ordem", ordem }));
    await hub.receber(JSON.stringify({ tipo: "ordem", ordem: { ...ordem, decisaoId: "dec-ninguem" } }));
    expect(ana).toHaveBeenCalledOnce();
  });

  it("guarda a dona em cache: não consulta o banco a cada evento", async () => {
    donos.donoDoRobo.mockClear();
    const hub = criarHubEventos({ donos, log });
    hub.registrar("ana", vi.fn());
    await hub.receber(JSON.stringify(risco("robo-ana")));
    await hub.receber(JSON.stringify(risco("robo-ana")));
    expect(donos.donoDoRobo).toHaveBeenCalledOnce();
  });

  it("descarta JSON quebrado ou fora do contrato, avisando no log", async () => {
    const hub = criarHubEventos({ donos, log });
    const ana = vi.fn();
    hub.registrar("ana", ana);
    await hub.receber("{quebrado");
    await hub.receber(JSON.stringify({ tipo: "desconhecido" }));
    expect(ana).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it("cancelar o registro para as entregas; ouvintes recebem todo evento válido", async () => {
    const hub = criarHubEventos({ donos, log });
    const ana = vi.fn();
    const ouvinte = vi.fn();
    const sair = hub.registrar("ana", ana);
    hub.aoEvento(ouvinte);
    expect(hub.conectados()).toBe(1);
    sair();
    expect(hub.conectados()).toBe(0);
    await hub.receber(JSON.stringify(risco("robo-ana")));
    expect(ana).not.toHaveBeenCalled();
    expect(ouvinte).toHaveBeenCalledOnce();
  });

  it("falha ao achar a dona não derruba o hub", async () => {
    const hub = criarHubEventos({
      donos: { ...donos, donoDoRobo: vi.fn(async () => Promise.reject(new Error("banco fora"))) },
      log,
    });
    await expect(hub.receber(JSON.stringify(risco("x")))).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });
});
