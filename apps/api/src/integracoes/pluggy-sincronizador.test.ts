import type { DadosItem, ItemPluggyLinha, TituloSincronizado } from "@zentrade/banco";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../erros.js";
import { criarSincronizadorPluggy, type ArmazemPluggy } from "./pluggy-sincronizador.js";
import { ErroPluggy, type ClientePluggy, type InvestimentoPluggyApi, type ItemPluggyApi } from "./pluggy.js";

const ITEM = "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a";
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const item = (status = "UPDATED", clientUserId: string | null = ANA): ItemPluggyApi => ({
  id: ITEM,
  status,
  clientUserId,
  lastUpdatedAt: "2026-10-10T12:00:00Z",
  consentExpiresAt: null,
  error: null,
  connector: { id: 612, name: "Nubank", imageUrl: "https://cdn/nu.png" },
});

const investimento: InvestimentoPluggyApi = {
  id: "inv-1",
  name: "CDB",
  type: "FIXED_INCOME",
  subtype: "CDB",
  status: "ACTIVE",
  balance: 1010,
  amount: 1012,
  amountOriginal: 1000,
  rate: 100,
  rateType: "CDI",
  purchaseDate: "2026-03-01T00:00:00Z",
};

function clienteFalso(sobre: Partial<ClientePluggy> = {}): ClientePluggy {
  return {
    connectToken: vi.fn(async () => "token-widget"),
    item: vi.fn(async () => item()),
    investimentos: vi.fn(async () => [investimento, { ...investimento, id: "fundo", type: "MUTUAL_FUND" }]),
    pedirAtualizacao: vi.fn(async () => false),
    ...sobre,
  };
}

function armazemMemoria() {
  const itens = new Map<string, DadosItem & { usuarioId: string; erroSincronizacao: string | null }>();
  const aplicados: { titulos: readonly TituloSincronizado[]; completo: boolean }[] = [];
  const armazem: ArmazemPluggy = {
    registrar: async (usuarioId, d) => void itens.set(d.id, { ...d, usuarioId, erroSincronizacao: null }),
    obter: async (_u, id) => {
      const i = itens.get(id);
      return i
        ? ({
            id,
            instituicao: i.instituicao,
            situacao: i.situacao,
            erroSincronizacao: i.erroSincronizacao,
            titulos: 1,
          } as ItemPluggyLinha)
        : null;
    },
    aplicarSincronizacao: async (_u, _i, titulos, completo) => {
      aplicados.push({ titulos, completo });
      return { novos: titulos.length, atualizados: 0, encerrados: 0 };
    },
    marcarSincronizacao: async (_u, id, _em, erro) => {
      const i = itens.get(id);
      if (i) i.erroSincronizacao = erro;
    },
    todos: async () => [...itens.values()].map((i) => ({ id: i.id, usuarioId: i.usuarioId })),
  };
  return { armazem, itens, aplicados };
}

const base = {
  agora: () => 0,
  hoje: () => "2026-10-11",
  log: { warn: vi.fn() },
  esperar: async () => undefined,
};

describe("sincronizador da Pluggy", () => {
  it("sem credenciais: desligado, e cada ação explica como ligar", async () => {
    const s = criarSincronizadorPluggy({ ...base, cliente: null, armazem: armazemMemoria().armazem });
    expect(s.configurada).toBe(false);
    await expect(s.connectToken(ANA)).rejects.toMatchObject({
      statusCode: 503,
      codigo: "pluggy_nao_configurada",
    });
    await expect(s.sincronizar(ANA, ITEM)).rejects.toThrow(/PLUGGY_CLIENT_ID/);
    await s.sincronizarTodos();
  });

  it("connect token leva o id da pessoa", async () => {
    const cliente = clienteFalso();
    const s = criarSincronizadorPluggy({ ...base, cliente, armazem: armazemMemoria().armazem });
    expect(await s.connectToken(ANA, ITEM)).toBe("token-widget");
    expect(cliente.connectToken).toHaveBeenCalledWith(ANA, ITEM);
  });

  it("registrar grava o item e sincroniza: normaliza, conta os ignorados, lista completa", async () => {
    const m = armazemMemoria();
    const s = criarSincronizadorPluggy({ ...base, cliente: clienteFalso(), armazem: m.armazem });
    const r = await s.registrar(ANA, ITEM);
    expect(r).toMatchObject({ novos: 1, ignorados: 1, item: { id: ITEM, instituicao: "Nubank" } });
    expect(m.aplicados[0]?.completo).toBe(true);
    expect(m.itens.get(ITEM)?.logoUrl).toBe("https://cdn/nu.png");
  });

  it.each(["javascript:alert(1)", "http://cdn/nu.png", "não é url"])(
    "logo %s não é guardada",
    async (logo) => {
      const m = armazemMemoria();
      const cliente = clienteFalso({
        item: async () => ({ ...item(), connector: { id: 612, name: "Nubank", imageUrl: logo } }),
      });
      await criarSincronizadorPluggy({ ...base, cliente, armazem: m.armazem }).registrar(ANA, ITEM);
      expect(m.itens.get(ITEM)?.logoUrl).toBeNull();
    },
  );

  it.each([
    ["outra pessoa", "outra-pessoa"],
    ["sem dono", null],
    ["dono vazio", ""],
  ])("item criado para %s é recusado", async (_caso, dono) => {
    const m = armazemMemoria();
    const s = criarSincronizadorPluggy({
      ...base,
      cliente: clienteFalso({ item: async () => item("UPDATED", dono) }),
      armazem: m.armazem,
    });
    await expect(s.registrar(ANA, ITEM)).rejects.toMatchObject({ statusCode: 403 });
    expect(m.itens.size).toBe(0);
  });

  it("item ainda atualizando: grava o que veio sem encerrar nada", async () => {
    const m = armazemMemoria();
    const s = criarSincronizadorPluggy({
      ...base,
      cliente: clienteFalso({ item: async () => item("UPDATING") }),
      armazem: m.armazem,
    });
    await s.sincronizar(ANA, ITEM);
    expect(m.aplicados[0]?.completo).toBe(false);
  });

  it("pedir ao banco: espera sair de UPDATING", async () => {
    const estados = ["UPDATING", "UPDATING", "UPDATED"];
    const cliente = clienteFalso({
      pedirAtualizacao: async () => true,
      item: async () => item(estados.shift() ?? "UPDATED"),
    });
    const m = armazemMemoria();
    await criarSincronizadorPluggy({ ...base, cliente, armazem: m.armazem }).sincronizar(ANA, ITEM, true);
    expect(estados).toEqual([]);
    expect(m.aplicados[0]?.completo).toBe(true);
  });

  it("falha da Pluggy fica registrada no item e vira erro explicado", async () => {
    const m = armazemMemoria();
    await m.armazem.registrar(ANA, {
      id: ITEM,
      instituicao: "Nubank",
      conectorId: 1,
      logoUrl: null,
      situacao: "UPDATED",
      erro: null,
      atualizadoNoBanco: null,
      consentimentoExpira: null,
    });
    const s = criarSincronizadorPluggy({
      ...base,
      cliente: clienteFalso({
        investimentos: async () => Promise.reject(new ErroPluggy(429, "a Pluggy pediu para esperar")),
      }),
      armazem: m.armazem,
    });
    const erro = await s.sincronizar(ANA, ITEM).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ statusCode: 502, codigo: "pluggy_falhou" });
    expect(m.itens.get(ITEM)?.erroSincronizacao).toMatch(/esperar/);
  });

  it("chamadas simultâneas do mesmo item dividem a execução; a periódica passa por todos", async () => {
    const cliente = clienteFalso();
    const m = armazemMemoria();
    const s = criarSincronizadorPluggy({ ...base, cliente, armazem: m.armazem });
    await s.registrar(ANA, ITEM);
    await Promise.all([s.sincronizar(ANA, ITEM), s.sincronizar(ANA, ITEM)]);
    expect(cliente.investimentos).toHaveBeenCalledTimes(2);
    await s.sincronizarTodos();
    expect(cliente.investimentos).toHaveBeenCalledTimes(3);
    const parar = s.agendar(60_000);
    parar();
  });

  it("falha na periódica só vira aviso no log", async () => {
    const m = armazemMemoria();
    await m.armazem.registrar(ANA, {
      id: ITEM,
      instituicao: "Nubank",
      conectorId: 1,
      logoUrl: null,
      situacao: "UPDATED",
      erro: null,
      atualizadoNoBanco: null,
      consentimentoExpira: null,
    });
    const log = { warn: vi.fn() };
    const s = criarSincronizadorPluggy({
      ...base,
      log,
      cliente: clienteFalso({ item: async () => Promise.reject(new Error("rede")) }),
      armazem: m.armazem,
    });
    await s.sincronizarTodos();
    expect(log.warn).toHaveBeenCalled();
  });
});
