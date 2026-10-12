import type { Corretora, CredenciaisCorretora, RoboConfig } from "@zentrade/contratos";
import { ErroConfiguracao, type RestricoesChave } from "@zentrade/corretora";
import { describe, expect, it, vi } from "vitest";
import { conferirChaveParaOperar } from "./chave-segura.js";
import { CorretorasPorPessoa } from "./corretoras-por-pessoa.js";

const CHAVE = { apiKey: "k", apiSecret: "s" };
const restricoes = (r: Partial<RestricoesChave>): RestricoesChave => ({
  podeLer: true,
  podeSacar: false,
  podeNegociar: true,
  ipRestrito: true,
  ...r,
});

describe("chave da Binance antes de operar dinheiro real", () => {
  it("chave com saque é recusada com o que fazer", async () => {
    const conferir = conferirChaveParaOperar(async () => restricoes({ podeSacar: true }));
    const erro = await conferir("real", CHAVE).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroConfiguracao);
    expect((erro as Error).message).toMatch(/SAQUE/);
    expect((erro as Error).message).toMatch(/Contas e chaves/);
  });

  it("sem conseguir ler as permissões, não opera", async () => {
    await expect(
      conferirChaveParaOperar(async () => {
        throw new Error("timeout");
      })("real", CHAVE),
    ).rejects.toThrow(/timeout/);
    await expect(conferirChaveParaOperar(async () => null)("real", CHAVE)).rejects.toThrow(/não informou/);
  });

  it("chave sem saque passa; a testnet nem consulta", async () => {
    const ler = vi.fn(async () => restricoes({ ipRestrito: false }));
    await expect(conferirChaveParaOperar(ler)("real", CHAVE)).resolves.toBeUndefined();
    await expect(conferirChaveParaOperar(ler)("testnet", CHAVE)).resolves.toBeUndefined();
    expect(ler).toHaveBeenCalledOnce();
  });

  it("o robô não liga com a chave recusada, e a conferência só roda quando a chave muda", async () => {
    let podeSacar = true;
    const ler = vi.fn(async () => restricoes({ podeSacar }));
    const criar = vi.fn(
      (rede: "testnet" | "real", c: CredenciaisCorretora) => ({ rede, c }) as unknown as Corretora,
    );
    const porPessoa = new CorretorasPorPessoa({
      credenciais: { binance: async () => CHAVE },
      fallback: null,
      criar,
      conferirChave: conferirChaveParaOperar(ler),
    });
    const robo = { id: "r1", usuarioId: "ana", rede: "real" } as RoboConfig;
    await expect(porPessoa.para(robo)).rejects.toThrow(/SAQUE/);
    expect(criar).not.toHaveBeenCalled();
    podeSacar = false;
    const corretora = await porPessoa.para(robo);
    await porPessoa.para(robo);
    expect(corretora).toBeDefined();
    expect(criar).toHaveBeenCalledOnce();
    expect(ler).toHaveBeenCalledTimes(2);
  });
});
