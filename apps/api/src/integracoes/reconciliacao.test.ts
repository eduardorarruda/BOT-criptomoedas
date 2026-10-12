import type { ConferenciaAtivo, DivergenciaGravada, RoboDoRetrato } from "@zentrade/banco";
import type { AlertaEmitido, RedeConta } from "@zentrade/contratos";
import { ErroLimiteRequisicoes, ErroRede } from "@zentrade/corretora";
import { dec, paraTexto } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import type { ContaLeitura } from "./binance-conta.js";
import { criarReconciliador } from "./reconciliacao.js";

const ANA = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const BETO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";

const robo = (id: string, simbolo: string, quantidade: string): RoboDoRetrato => ({
  id,
  nome: id,
  simbolo,
  quantidade: dec(quantidade),
  precoMedio: dec(100),
});

interface Opcoes {
  readonly robos?: RoboDoRetrato[];
  readonly saldos?: { ativo: string; livre: string; bloqueado: string }[];
  readonly semChave?: boolean;
  readonly falha?: Error;
  readonly alvos?: { usuarioId: string; rede: RedeConta }[];
}

function montar(o: Opcoes = {}) {
  const registros: { usuarioId: string; rede: RedeConta; conferencias: readonly ConferenciaAtivo[] }[] = [];
  const alertas: AlertaEmitido[] = [];
  const contas: string[] = [];
  const conta = vi.fn(async () => {
    if (o.falha) throw o.falha;
    return {
      podeNegociar: true,
      saldos: (o.saldos ?? []).map((s) => ({
        ativo: s.ativo,
        livre: dec(s.livre),
        bloqueado: dec(s.bloqueado),
      })),
    };
  });
  const r = criarReconciliador({
    banco: {
      divergencias: {
        alvos: async (u?: string) =>
          (o.alvos ?? [{ usuarioId: ANA, rede: "testnet" }]).filter((a) => !u || a.usuarioId === u),
        registrar: async (usuarioId, rede, conferencias) => {
          registros.push({ usuarioId, rede, conferencias });
          const novas: DivergenciaGravada[] = conferencias
            .filter((c) => c.divergente)
            .map((c) => ({
              id: `div-${c.ativo}`,
              rede,
              ativo: c.ativo,
              esperado: paraTexto(c.esperado),
              naCorretora: paraTexto(c.naCorretora),
              falta: paraTexto(c.falta),
              estado: "aberta",
              detectadaEm: 1,
              atualizadaEm: 1,
              resolvidaEm: null,
              resolvidaPor: null,
            }));
          return { novas, resolvidas: 0 };
        },
      },
      riscoConta: { posicoes: async () => o.robos ?? [] },
      mercado: {
        ultimosFechamentos: async (simbolos) =>
          new Map(simbolos.map((s) => [s, { preco: "60000", em: 1 }] as const)),
      },
    },
    credenciais: { binance: async () => (o.semChave ? null : { apiKey: "k", apiSecret: "s" }) },
    criarConta: (rede) => {
      contas.push(rede);
      return { conta } as unknown as ContaLeitura;
    },
    alertas: { emitir: async (a) => (alertas.push(a), "novo") },
    agora: () => 1_000,
    log: { warn: vi.fn(), error: vi.fn() },
  });
  return { r, registros, alertas, contas, conta };
}

describe("reconciliação com a corretora", () => {
  it("conta o bloqueado (stop na corretora) como saldo: não diverge", async () => {
    const m = montar({
      robos: [robo("r1", "BTCUSDT", "0.1")],
      saldos: [{ ativo: "BTC", livre: "0.02", bloqueado: "0.08" }],
    });
    expect(await m.r.conferir(ANA, "testnet")).toEqual({
      rede: "testnet",
      ok: true,
      erro: null,
      ativos: 1,
      divergentes: 0,
    });
    expect(m.alertas).toHaveLength(0);
  });

  it("falta além da tolerância abre divergência e avisa; nada é negociado", async () => {
    const m = montar({
      robos: [robo("r1", "BTCUSDT", "0.06"), robo("r2", "BTCUSDT", "0.04"), robo("r3", "ETHUSDT", "1")],
      saldos: [
        { ativo: "BTC", livre: "0.05", bloqueado: "0" },
        { ativo: "ETH", livre: "0.999", bloqueado: "0" },
      ],
    });
    const r = await m.r.conferir(ANA, "testnet");
    expect(r.divergentes).toBe(1);
    const [btc, eth] = m.registros[0]!.conferencias;
    expect(btc).toMatchObject({ ativo: "BTC", divergente: true });
    expect(btc?.esperado.toFixed()).toBe("0.1"); // os dois robôs de BTC somados
    expect(btc?.falta.toFixed()).toBe("0.05");
    expect(eth?.divergente).toBe(false); // 0,1% de taxa no próprio ativo: dentro da tolerância
    expect(m.alertas).toMatchObject([
      { tipo: "divergencia_saldo", gravidade: "critico", usuarioId: ANA, chave: "divergencia_saldo:div-BTC" },
    ]);
    expect(m.alertas[0]?.mensagem).toContain("nada foi vendido nem comprado");
    expect(m.conta).toHaveBeenCalledOnce(); // só leitura do saldo: a conta falsa nem sabe enviar ordem
  });

  it("ativo que falta inteiro na corretora diverge", async () => {
    const m = montar({ robos: [robo("r1", "SOLUSDT", "3")], saldos: [] });
    expect((await m.r.conferir(ANA, "testnet")).divergentes).toBe(1);
  });

  it("sem posição: fecha o que estiver aberto e nem chama a Binance", async () => {
    const m = montar({ robos: [robo("r1", "BTCUSDT", "0")] });
    expect((await m.r.conferir(ANA, "testnet")).ok).toBe(true);
    expect(m.registros).toEqual([{ usuarioId: ANA, rede: "testnet", conferencias: [] }]);
    expect(m.contas).toHaveLength(0);
  });

  it("sem chave cadastrada ou com a Binance fora, explica e não registra nada", async () => {
    const semChave = montar({ robos: [robo("r1", "BTCUSDT", "1")], semChave: true });
    expect((await semChave.r.conferir(ANA, "real")).erro).toMatch(/Contas e chaves/);
    const fora = montar({ robos: [robo("r1", "BTCUSDT", "1")], falha: new ErroRede("sem rota") });
    const r = await fora.r.conferir(ANA, "testnet");
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("sem rota");
    expect(fora.registros).toHaveLength(0);
  });

  it("a rodada para no limite da Binance; a conferência da pessoa segue rede a rede", async () => {
    const alvos = [
      { usuarioId: ANA, rede: "testnet" as const },
      { usuarioId: BETO, rede: "testnet" as const },
      { usuarioId: ANA, rede: "real" as const },
    ];
    const limitada = montar({
      robos: [robo("r1", "BTCUSDT", "1")],
      falha: new ErroLimiteRequisicoes("peso esgotado", 60_000, false),
      alvos,
    });
    await limitada.r.rodada();
    expect(limitada.contas).toEqual(["testnet"]);
    const pessoa = montar({
      robos: [robo("r1", "BTCUSDT", "1")],
      saldos: [{ ativo: "BTC", livre: "1", bloqueado: "0" }],
      alvos,
    });
    const r = await pessoa.r.conferirPessoa(ANA);
    expect(r.conferidas.map((c) => [c.rede, c.ok])).toEqual([
      ["testnet", true],
      ["real", true],
    ]);
  });
});
