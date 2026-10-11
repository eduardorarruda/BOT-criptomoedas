import { describe, expect, it } from "vitest";
import { filtrarCom, validarBusca } from "../../componentes/filtros";
import { robosIniciais } from "../../demo/dados";
import { decisoesIniciais, ordensIniciais } from "../../demo/historico";
import {
  agruparOrdens,
  buscaOrdens,
  ordenarOrdens,
  predicadosOrdens,
  resumirOrdens,
  roboDaOrdem,
  valorExecutado,
} from "./filtros";

const AGORA = Date.UTC(2026, 9, 11, 15);
const DIA = 86_400_000;
const ctx = { robos: robosIniciais(AGORA), decisoes: decisoesIniciais(AGORA), agora: AGORA };
const ordens = ordensIniciais(AGORA);
const validar = validarBusca(buscaOrdens);
const filtrar = (q: Record<string, unknown>) => filtrarCom(ordens, predicadosOrdens(validar(q), ctx));

describe("filtros das ordens", () => {
  it("robô vem da decisão que originou a ordem", () => {
    const sol = filtrar({ robo: "r-sol" });
    expect(sol.length).toBeGreaterThan(0);
    expect(sol.every((o) => roboDaOrdem(o, ctx)?.id === "r-sol")).toBe(true);
  });

  it("lado, estado, par, período e texto (motivo da corretora)", () => {
    expect(filtrar({ lado: "VENDA" }).every((o) => o.lado === "VENDA")).toBe(true);
    expect(filtrar({ estado: "REJEITADA" }).map((o) => o.id)).toEqual(["o-d-13"]);
    expect(filtrar({ simbolo: "BTCUSDT" }).every((o) => o.simbolo === "BTCUSDT")).toBe(true);
    expect(filtrar({ periodo: "7d" }).every((o) => o.criadaEm >= AGORA - 7 * DIA)).toBe(true);
    expect(filtrar({ q: "saldo insuficiente" }).map((o) => o.id)).toEqual(["o-d-13"]);
  });

  it("ordena por valor executado e por taxa, com a rejeitada (sem execução) no fim", () => {
    const porValor = ordenarOrdens(ordens, { ordem: "valor" });
    expect(valorExecutado(porValor[0]!)).toBeGreaterThanOrEqual(valorExecutado(porValor[1]!));
    expect(porValor.at(-1)!.estado).toBe("REJEITADA");
    expect(ordenarOrdens(ordens, { ordem: "taxa", dir: "asc" }).at(-1)!.estado).toBe("REJEITADA");
    const recentes = ordenarOrdens(ordens, {});
    expect(recentes[0]!.criadaEm).toBeGreaterThanOrEqual(recentes[1]!.criadaEm);
  });

  it("agrupa por robô e por dia; sem agrupamento é uma lista só", () => {
    expect(agruparOrdens(ordens, {}, ctx)).toHaveLength(1);
    const porRobo = agruparOrdens(ordens, { agrupar: "robo" }, ctx);
    expect(porRobo.map((g) => g.titulo)).toContain("SOL rompimento");
    expect(agruparOrdens(ordenarOrdens(ordens, {}), { agrupar: "dia" }, ctx)[0]!.titulo).toBe("Hoje");
  });

  it("totais seguem o filtro", () => {
    const r = resumirOrdens(filtrar({ robo: "r-sol" }));
    expect(r.total).toBe(filtrar({ robo: "r-sol" }).length);
    expect(r.rejeitadas).toBe(0);
    expect(Number(r.valor)).toBeGreaterThan(0);
    expect(resumirOrdens([])).toEqual({
      total: 0,
      preenchidas: 0,
      rejeitadas: 0,
      valor: "0.00",
      taxas: "0.0000",
    });
  });
});
