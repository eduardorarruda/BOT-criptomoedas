import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { contarPor, filtrarCom, validarBusca } from "../../componentes/filtros";
import { robosIniciais } from "../../demo/dados";
import { decisoesIniciais } from "../../demo/historico";
import {
  agruparDecisoes,
  buscaDecisoes,
  desfechoDe,
  ordenarDecisoes,
  predicadosDecisoes,
  resumirDecisoes,
  valorDe,
} from "./filtros";

const AGORA = Date.UTC(2026, 9, 11, 15);
const DIA = 86_400_000;
const robos: readonly RoboDTO[] = robosIniciais(AGORA);
const todas: readonly DecisaoDTO[] = decisoesIniciais(AGORA);
const ctx = { robos, agora: AGORA };
const validar = validarBusca(buscaDecisoes);
const filtrar = (query: Record<string, unknown>) =>
  filtrarCom(todas, predicadosDecisoes(validar(query), ctx));

describe("filtros do diário de decisões", () => {
  it("sem filtro, passa tudo", () => {
    expect(filtrar({})).toHaveLength(todas.length);
  });

  it("robô, ação e estado combinam (E entre filtros, OU dentro de um filtro)", () => {
    const r = filtrar({ robo: "r-sol,r-btc", acao: "COMPRAR", estado: "executada,barrada" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((d) => ["r-sol", "r-btc"].includes(d.roboId))).toBe(true);
    expect(r.every((d) => d.sinal.acao === "COMPRAR")).toBe(true);
    expect(r.every((d) => ["executada", "barrada"].includes(d.estado))).toBe(true);
  });

  it("símbolo vem do robô; busca lê explicação, argumento da IA e barreiras", () => {
    expect(filtrar({ simbolo: "ETHUSDT" }).every((d) => d.roboId === "r-eth")).toBe(true);
    const confianca = filtrar({ q: "confiança mínimo" });
    expect(confianca.map((d) => d.id)).toContain("d-02");
    expect(filtrar({ q: "sma(200) rsi" }).every((d) => d.roboId === "r-btc")).toBe(true);
  });

  it("período corta pelo instante da decisão", () => {
    const semana = filtrar({ periodo: "7d" });
    expect(semana.every((d) => d.em >= AGORA - 7 * DIA)).toBe(true);
    expect(semana.length).toBeLessThan(todas.length);
  });

  it("desfecho separa ganho, perda e sem avaliação", () => {
    expect(filtrar({ desfecho: "ganho" }).every((d) => Number(d.desfecho?.resultado) > 0)).toBe(true);
    expect(filtrar({ desfecho: "perda" }).every((d) => Number(d.desfecho?.resultado) < 0)).toBe(true);
    expect(desfechoDe(todas.find((d) => d.id === "d-01")!)).toBe("sem");
  });

  it("contagem facetada: cada robô conta com os outros filtros valendo", () => {
    const b = validar({ robo: "r-sol", estado: "executada" });
    const contagem = contarPor(filtrarCom(todas, predicadosDecisoes(b, ctx), "robo"), (d) => d.roboId);
    expect(contagem.get("r-eth") ?? 0).toBe(0); // o robô que só observa nunca executa
    expect(contagem.get("r-btc")).toBeGreaterThan(0);
  });

  it("ordena por valor, resultado e custo; o desconhecido fica no fim", () => {
    const porValor = ordenarDecisoes(todas, { ordem: "valor", dir: "desc" });
    expect(valorDe(porValor[0]!)).toBeGreaterThanOrEqual(valorDe(porValor[1]!)!);
    const porResultado = ordenarDecisoes(todas, { ordem: "resultado", dir: "asc" });
    expect(Number(porResultado[0]!.desfecho?.resultado)).toBeLessThan(0);
    expect(porResultado.at(-1)!.desfecho).toBeUndefined();
    const recentes = ordenarDecisoes(todas, {});
    expect(recentes[0]!.em).toBeGreaterThanOrEqual(recentes[1]!.em);
    expect(ordenarDecisoes(todas, { ordem: "custo", dir: "desc" })[0]!.custoIaUsd).toBeDefined();
  });

  it("agrupa por dia, por robô ou não agrupa", () => {
    const recentes = ordenarDecisoes(todas, {});
    expect(agruparDecisoes(recentes, {}, ctx)[0]!.titulo).toBe("Hoje");
    const porRobo = agruparDecisoes(recentes, { agrupar: "robo" }, ctx);
    expect(porRobo.map((g) => g.titulo).sort()).toEqual(
      [...new Set(todas.map((d) => robos.find((r) => r.id === d.roboId)!.nome))].sort(),
    );
    expect(agruparDecisoes(recentes, { agrupar: "nenhum" }, ctx)).toHaveLength(1);
    // Ordenado por valor, "por dia" quebraria em pedaços: vira uma lista só.
    expect(agruparDecisoes(recentes, { ordem: "valor" }, ctx)).toHaveLength(1);
  });

  it("os totais seguem o filtro", () => {
    const r = resumirDecisoes(filtrar({ desfecho: "ganho,perda" }));
    expect(r.comDesfecho).toBe(r.total);
    const soma = filtrar({ desfecho: "ganho,perda" }).reduce((s, d) => s + Number(d.desfecho!.resultado), 0);
    expect(Number(r.resultado)).toBeCloseTo(soma, 2);
    expect(resumirDecisoes([])).toMatchObject({ total: 0, resultado: "0.00", custoIa: "0.0000" });
  });
});
