import { dec } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { AgenteFixo } from "../portas/agente-fixo.js";
import { HORA, serieDeAlta } from "../teste/serie-replay.js";
import { lerArgumentosReplay } from "./argumentos.js";
import { rodarComando, type DependenciasComando } from "./comando.js";
import type { AnaliseReplay, NovaAnaliseReplay } from "@zentrade/banco";
import { REPLAY_P1 } from "./p1.js";

// Cada teste gera os sinais de 2 pares com ~3 mil candles: pesado com a cobertura ligada.
vi.setConfig({ testTimeout: 90_000 });

const INICIO_DADOS = Date.parse("2026-05-01T00:00:00Z");
const NOMES = REPLAY_P1.simbolos;

function montar(agente: DependenciasComando["agente"]) {
  const gravadas: NovaAnaliseReplay[] = [];
  const saidas: Record<string, string> = {};
  const linhas: string[] = [];
  const deps: DependenciasComando = {
    // 2 pares ganham série de teste (semente diferente); os outros ficam sem candles
    candles: async (simbolo) =>
      simbolo === NOMES[0] || simbolo === NOMES[1]
        ? serieDeAlta(INICIO_DADOS, 3300, simbolo === NOMES[0] ? 7 : 11)
        : [],
    agente,
    armazem: {
      gravar: async (a) => void gravadas.push(a),
      listar: async (): Promise<AnaliseReplay[]> => gravadas,
      custoTotal: async () => gravadas.reduce((s, a) => s.plus(a.custoIaUsd), dec(0)),
    },
    escrever: (l) => linhas.push(l),
    escreverArquivo: async (c, t) => void (saidas[c] = t),
    agora: () => Date.parse("2026-10-21T12:00:00Z"),
    dadosAte: "2026-10-21T12:00Z",
    aceitarSemCenarios: true,
  };
  return { deps, gravadas, saidas, linhas };
}

const JANELA = ["--inicio", "2026-07-01", "--fim", "2026-09-15"];

describe("comando do replay (agente fixo, sem rede e sem IA)", () => {
  it("sem --confirmar estima e não chama o agente nem grava", async () => {
    const analisar = vi.fn();
    const { deps, gravadas } = montar({ analisar });
    const r = await rodarComando(lerArgumentosReplay(JANELA), deps);
    expect(r.resumo).toMatchObject({ parou: "sem_confirmacao", analisadosAgora: 0 });
    expect(r.resumo?.sinaisNaJanela).toBeGreaterThan(3);
    expect(analisar).not.toHaveBeenCalled();
    expect(gravadas).toHaveLength(0);
    expect(r.relatorio).toBeNull();
  });

  it("com --confirmar grava as análises na tabela do replay e monta o relatório", async () => {
    const { deps, gravadas, saidas } = montar(new AgenteFixo("sempre_concorda"));
    const args = lerArgumentosReplay([...JANELA, "--confirmar", "--maximo", "6", "--saida", "RESULTADOS.md"]);
    const r = await rodarComando(args, deps);
    expect(r.resumo).toMatchObject({ parou: "concluido", analisadosAgora: 6 });
    expect(gravadas).toHaveLength(6);
    expect(gravadas.every((g) => g.veredito === "aprovou" && g.execucao === REPLAY_P1.nome)).toBe(true);
    expect(gravadas.every((g) => Math.min(...[g.sinalEm]) >= Date.parse("2026-07-01T00:00:00Z"))).toBe(true);
    expect(saidas["RESULTADOS.md"]).toContain("# Replay do Claude sobre a P1");
    expect(saidas["RESULTADOS.md"]).toMatch(/SEM VEREDITO/); // o agente fixo aprovou todos: não filtrou
    expect(r.resumo?.sobraram).toBeGreaterThan(0);
  });

  it("o agente fixo que nunca concorda veta todos: também sem veredito, sem erro", async () => {
    const { deps, gravadas } = montar(new AgenteFixo("nunca_concorda"));
    const r = await rodarComando(lerArgumentosReplay([...JANELA, "--confirmar", "--maximo", "4"]), deps);
    expect(gravadas.every((g) => g.veredito === "vetou")).toBe(true);
    expect(r.relatorio).toMatch(/SEM VEREDITO/);
  });

  it("agente que não entende o modo replay barra antes de enviar qualquer sinal", async () => {
    const analisar = vi.fn();
    const { deps, gravadas } = montar({ analisar });
    const conferirAgente = vi.fn(async () => {
      throw new Error("o agente não conhece o modo replay");
    });
    await expect(
      rodarComando(lerArgumentosReplay([...JANELA, "--confirmar"]), { ...deps, conferirAgente }),
    ).rejects.toThrow(/modo replay/);
    expect(analisar).not.toHaveBeenCalled();
    expect(gravadas).toHaveLength(0);
    // só estimando (sem --confirmar) não precisa conferir
    conferirAgente.mockClear();
    await rodarComando(lerArgumentosReplay(JANELA), { ...deps, conferirAgente });
    expect(conferirAgente).not.toHaveBeenCalled();
  });

  it("sem agente configurado, recusa em vez de cair num agente fixo", async () => {
    const { deps } = montar(null);
    await expect(rodarComando(lerArgumentosReplay([...JANELA, "--confirmar"]), deps)).rejects.toThrow(
      /AGENTE_URL/,
    );
  });

  it("--so-relatorio relê o armazém sem falar com o agente", async () => {
    const analisar = vi.fn();
    const { deps } = montar({ analisar });
    const r = await rodarComando(lerArgumentosReplay([...JANELA, "--so-relatorio"]), deps);
    expect(analisar).not.toHaveBeenCalled();
    expect(r.resumo).toBeNull();
    expect(r.relatorio).toBeNull(); // armazém vazio: nada a relatar
  });

  it("a hora do sinal nunca passa do fim da janela", async () => {
    const { deps, gravadas } = montar(new AgenteFixo("sempre_concorda"));
    await rodarComando(lerArgumentosReplay([...JANELA, "--confirmar", "--maximo", "50"]), deps);
    const fim = Date.parse("2026-09-16T00:00:00Z");
    expect(gravadas.length).toBeGreaterThan(0);
    expect(gravadas.every((g) => g.sinalEm < fim + HORA)).toBe(true);
  });
});
