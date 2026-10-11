import type { EstadoIndicador, PontoIndicador } from "@zentrade/banco";
import type { SerieIndicador } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { criarAtualizadorIndicadores, DESDE_PADRAO, type ArmazemIndicadores } from "./bcb-atualizador.js";
import type { ClienteBcb } from "./bcb.js";

function armazemMemoria(estado: EstadoIndicador[] = []) {
  const gravados = new Map<SerieIndicador, PontoIndicador[]>();
  const verificacoes: { serie: SerieIndicador; erro: string | null }[] = [];
  const armazem: ArmazemIndicadores = {
    gravar: async (serie, pontos) => {
      gravados.set(serie, [...(gravados.get(serie) ?? []), ...pontos]);
      return pontos.length;
    },
    registrarVerificacao: async (serie, _em, erro) => void verificacoes.push({ serie, erro }),
    estado: async () => estado,
  };
  return { armazem, gravados, verificacoes };
}

const log = { warn: vi.fn() };
const AGORA = Date.parse("2026-10-11T12:00:00Z");

describe("atualizador dos índices do Banco Central", () => {
  it("na primeira vez busca desde 2015 cada série, pelo código do SGS", async () => {
    const pedidos: [number, string, string][] = [];
    const cliente: ClienteBcb = {
      serie: async (codigo, de, ate) => {
        pedidos.push([codigo, de, ate]);
        return [{ dia: "2026-10-09", valor: "0.050788", diaFim: null }];
      },
    };
    const { armazem, gravados, verificacoes } = armazemMemoria();
    const r = await criarAtualizadorIndicadores({ cliente, armazem, agora: () => AGORA, log }).atualizar();
    expect(pedidos.map((p) => p[0])).toEqual([12, 11, 432, 433, 195, 226]);
    expect(pedidos.every(([, de, ate]) => de === DESDE_PADRAO && ate === "2026-10-11")).toBe(true);
    expect(r.every((x) => x.erro === null && x.novos === 1)).toBe(true);
    expect(gravados.get("CDI")).toHaveLength(1);
    expect(verificacoes).toHaveLength(6);
  });

  it("depois, só a cauda, com 10 dias de folga", async () => {
    const pedidos: string[] = [];
    const cliente: ClienteBcb = { serie: async (_c, de) => (pedidos.push(de), []) };
    const { armazem } = armazemMemoria([
      { serie: "CDI", verificadoEm: 0, ultimoDia: "2026-10-09", erro: null },
    ]);
    await criarAtualizadorIndicadores({ cliente, armazem, agora: () => AGORA, log }).atualizar();
    expect(pedidos[0]).toBe("2026-09-29");
    expect(pedidos[1]).toBe(DESDE_PADRAO);
  });

  it("uma série com erro fica registrada e não para as outras", async () => {
    const cliente: ClienteBcb = {
      serie: async (codigo) => {
        if (codigo === 433) throw new Error("o Banco Central respondeu 503 ao buscar a série 433");
        return [];
      },
    };
    const { armazem, verificacoes } = armazemMemoria();
    const r = await criarAtualizadorIndicadores({ cliente, armazem, agora: () => AGORA, log }).atualizar();
    expect(r.find((x) => x.serie === "IPCA")?.erro).toMatch(/503/);
    expect(verificacoes.find((v) => v.serie === "IPCA")?.erro).toMatch(/503/);
    expect(r.filter((x) => x.erro === null)).toHaveLength(5);
    expect(log.warn).toHaveBeenCalled();
  });

  it("chamadas simultâneas dividem a mesma execução; agendar roda já e para", async () => {
    let chamadas = 0;
    const cliente: ClienteBcb = { serie: async () => (chamadas++, []) };
    const { armazem } = armazemMemoria();
    const at = criarAtualizadorIndicadores({ cliente, armazem, agora: () => AGORA, log });
    await Promise.all([at.atualizar(), at.atualizar()]);
    expect(chamadas).toBe(6);
    const parar = at.agendar(60_000);
    await vi.waitFor(() => expect(chamadas).toBe(12));
    parar();
  });
});
