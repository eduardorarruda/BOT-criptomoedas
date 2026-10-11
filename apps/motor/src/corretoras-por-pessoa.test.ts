import type { Corretora, CredenciaisCorretora, PortaCredenciais, RoboConfig } from "@zentrade/contratos";
import { ErroConfiguracao } from "@zentrade/corretora";
import { describe, expect, it, vi } from "vitest";
import { CorretorasPorPessoa } from "./corretoras-por-pessoa.js";

const robo = (id: string, usuarioId: string, rede: RoboConfig["rede"] = "testnet") =>
  ({ id, usuarioId, rede }) as RoboConfig;

function montar(chaves: Record<string, CredenciaisCorretora>, fallback: CredenciaisCorretora | null = null) {
  let atuais = { ...chaves };
  const credenciais: PortaCredenciais = {
    binance: vi.fn(async (u: string, rede: string) => atuais[`${u}:${rede}`] ?? null),
  };
  const criar = vi.fn(
    (rede: "testnet" | "real", c: CredenciaisCorretora) =>
      ({ rede, chave: c.apiKey }) as unknown as Corretora,
  );
  const porPessoa = new CorretorasPorPessoa({ credenciais, fallback, criar });
  return { porPessoa, criar, credenciais, trocar: (c: Record<string, CredenciaisCorretora>) => (atuais = c) };
}

const CHAVE_ANA = { apiKey: "ana-k", apiSecret: "ana-s" };
const CHAVE_BETO = { apiKey: "beto-k", apiSecret: "beto-s" };

describe("uma corretora por pessoa e rede", () => {
  it("cada pessoa opera com a própria chave; robôs da mesma pessoa dividem a corretora", async () => {
    const { porPessoa, criar } = montar({ "ana:testnet": CHAVE_ANA, "beto:testnet": CHAVE_BETO });
    const a1 = await porPessoa.para(robo("r1", "ana"));
    const a2 = await porPessoa.para(robo("r2", "ana"));
    const b1 = await porPessoa.para(robo("r3", "beto"));
    expect(a1).toBe(a2);
    expect(b1).not.toBe(a1);
    expect(criar.mock.calls.map(([rede, c]) => [rede, c.apiKey])).toEqual([
      ["testnet", "ana-k"],
      ["testnet", "beto-k"],
    ]);
  });

  it("chave trocada na tela: o próximo robô a ligar recebe uma corretora nova", async () => {
    const { porPessoa, criar, trocar } = montar({ "ana:testnet": CHAVE_ANA });
    const antes = await porPessoa.para(robo("r1", "ana"));
    trocar({ "ana:testnet": { apiKey: "ana-k2", apiSecret: "ana-s2" } });
    const depois = await porPessoa.para(robo("r1", "ana"));
    expect(depois).not.toBe(antes);
    expect(criar).toHaveBeenCalledTimes(2);
  });

  it("robôs ligando juntos não criam duas corretoras para a mesma pessoa", async () => {
    const { porPessoa, criar } = montar({ "ana:testnet": CHAVE_ANA });
    const [x, y] = await Promise.all([porPessoa.para(robo("r1", "ana")), porPessoa.para(robo("r2", "ana"))]);
    expect(x).toBe(y);
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it("sem chave cadastrada: o robô não liga e o erro diz o que fazer", async () => {
    const { porPessoa } = montar({});
    const erro = await porPessoa.para(robo("r1", "ana")).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroConfiguracao);
    expect((erro as Error).message).toMatch(/Contas e chaves/);
  });

  it("desenvolvimento: sem chave da pessoa, usa a do ambiente", async () => {
    const { porPessoa, criar } = montar({}, { apiKey: "env-k", apiSecret: "env-s" });
    await porPessoa.para(robo("r1", "ana"));
    expect(criar.mock.calls[0]![1].apiKey).toBe("env-k");
  });

  it("a chave da pessoa vale mais que a do ambiente", async () => {
    const { porPessoa, criar } = montar(
      { "ana:testnet": CHAVE_ANA },
      { apiKey: "env-k", apiSecret: "env-s" },
    );
    await porPessoa.para(robo("r1", "ana"));
    expect(criar.mock.calls[0]![1].apiKey).toBe("ana-k");
  });

  it("sem banco de credenciais e sem fallback, explica", async () => {
    const porPessoa = new CorretorasPorPessoa({ credenciais: null, fallback: null, criar: vi.fn() });
    await expect(porPessoa.para(robo("r1", "ana"))).rejects.toThrow(/ZENTRADE_CHAVE_MESTRA/);
  });

  it("papel não tem conta de corretora", async () => {
    const { porPessoa } = montar({ "ana:testnet": CHAVE_ANA });
    await expect(porPessoa.para(robo("r1", "ana", "papel"))).rejects.toThrow(/papel/);
  });

  it("a chave lenta de uma pessoa não atrasa os robôs de outra", async () => {
    let liberarAna: () => void = () => {};
    const anaPendente = new Promise<void>((r) => (liberarAna = r));
    const credenciais: PortaCredenciais = {
      binance: vi.fn(async (u: string) => {
        if (u === "ana") await anaPendente;
        return u === "ana" ? CHAVE_ANA : CHAVE_BETO;
      }),
    };
    const criar = vi.fn(
      (rede: "testnet" | "real", c: CredenciaisCorretora) =>
        ({ rede, chave: c.apiKey }) as unknown as Corretora,
    );
    const porPessoa = new CorretorasPorPessoa({ credenciais, fallback: null, criar });
    const daAna = porPessoa.para(robo("r1", "ana"));
    await expect(porPessoa.para(robo("r2", "beto"))).resolves.toMatchObject({ chave: "beto-k" });
    liberarAna();
    await expect(daAna).resolves.toMatchObject({ chave: "ana-k" });
  });
});
