import type { CandidataAvaliacao, NovaAvaliacao, PortaPlacar, PropostaAgente } from "@zentrade/contratos";
import type { CandleDTO, ConsultaCandles } from "@zentrade/banco";
import { dec, type Regra } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { RelogioManual } from "../relogio.js";
import { avaliarPendentes, ligarAvaliador, type DependenciasAvaliador } from "./avaliador.js";

const HORA = 3_600_000;
const T0 = Date.UTC(2026, 9, 10, 0, 0);
const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const proposta: PropostaAgente = {
  acao: "aguardar",
  confianca: 0.7,
  tamanhoRelativo: 1,
  justificativa: "x",
  riscos: [],
  fontes: [],
};
const candidata = (decisaoId: string, simbolo = "BTCUSDT"): CandidataAvaliacao => ({
  decisaoId,
  usuarioId: "u1",
  roboId: "r1",
  simbolo,
  intervalo: "1h",
  em: T0 + HORA - 1,
  preco: dec(100),
  quantidade: null,
  estado: "registrada",
  proposta,
  protecao: null,
  resultadoReal: null,
  estrategia: { entrada: sempre, stop: 0.02, alvoLiquido: 0.03, taxa: 0 },
  riscoPorOperacao: dec(10),
  exposicaoMaxima: dec(1000),
});

const dto = (i: number, o: number, h: number, l: number, c: number): CandleDTO => ({
  abertura: T0 + i * HORA,
  abre: String(o),
  maxima: String(h),
  minima: String(l),
  fecha: String(c),
  volume: "1",
});

/** Candles gravados: o do sinal (0), um parado e um que toca o stop (2); o 3 ainda não fechou. */
const GRAVADOS = [
  dto(0, 100, 100, 100, 100),
  dto(1, 100, 100, 100, 100),
  dto(2, 100, 100, 97, 98),
  dto(3, 98, 98, 98, 98),
];

function montar(lista: CandidataAvaliacao[], agora = T0 + 3 * HORA + 10) {
  const gravadas: NovaAvaliacao[] = [];
  const pedidos: Parameters<PortaPlacar["candidatas"]>[0][] = [];
  const consultas: ConsultaCandles[] = [];
  const registro = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps: DependenciasAvaliador = {
    placar: {
      candidatas: (f) => {
        pedidos.push(f);
        return Promise.resolve(lista);
      },
      gravar: (a) => {
        if (a.decisaoId === "explode") return Promise.reject(new Error("banco fora"));
        gravadas.push(a);
        return Promise.resolve();
      },
    },
    candles: {
      candles: (c) => {
        consultas.push(c);
        return Promise.resolve(GRAVADOS.filter((k) => k.abertura >= c.inicio && k.abertura < c.fim));
      },
    },
    relogio: new RelogioManual(agora),
    registro,
  };
  return { deps, gravadas, pedidos, consultas, registro };
}

describe("avaliador do placar (motor)", () => {
  it("busca as candidatas, carrega antes e depois do sinal e grava o desfecho", async () => {
    const m = montar([candidata("d1")]);
    const r = await avaliarPendentes(m.deps, { lote: 20, janelaDias: 30, revisarMs: 600_000 });
    expect(r).toEqual({ avaliadas: 1, concluidas: 1, falharam: 0 });
    expect(m.pedidos[0]).toEqual({
      desde: T0 + 3 * HORA + 10 - 30 * 86_400_000,
      revisarAntesDe: T0 + 3 * HORA + 10 - 600_000,
      limite: 20,
    });
    expect(m.gravadas[0]).toMatchObject({
      decisaoId: "d1",
      situacao: "concluida",
      motivo: "stop",
      barras: 2,
    });
    // antes: até a abertura do candle seguinte ao sinal; depois: só candles já fechados
    expect(m.consultas.map((c) => [c.simbolo, c.intervalo, c.fim])).toEqual([
      ["BTCUSDT", "1h", T0 + HORA],
      ["BTCUSDT", "1h", T0 + HORA + 500 * HORA],
    ]);
  });

  it("um candle ainda aberto não entra: sem fechamento, a decisão fica pendente", async () => {
    const m = montar([candidata("d1")], T0 + 2 * HORA + 10);
    await avaliarPendentes(m.deps, { lote: 20, janelaDias: 30, revisarMs: 600_000 });
    expect(m.gravadas[0]).toMatchObject({ situacao: "pendente", barras: 1 });
  });

  it("uma falha não para as outras: registra e segue", async () => {
    const m = montar([candidata("explode"), candidata("d2"), candidata("d3", "XYZ")]);
    const r = await avaliarPendentes(m.deps, { lote: 20, janelaDias: 30, revisarMs: 600_000 });
    expect(r).toEqual({ avaliadas: 1, concluidas: 1, falharam: 2 });
    expect(m.gravadas.map((a) => a.decisaoId)).toEqual(["d2"]);
    expect(m.registro.warn).toHaveBeenCalledTimes(2);
  });

  it("ligado: roda na partida e a cada intervalo, sem duas rodadas ao mesmo tempo, e para", async () => {
    vi.useFakeTimers();
    try {
      const m = montar([candidata("d1")]);
      const candidatas = vi.spyOn(m.deps.placar, "candidatas");
      const ligado = ligarAvaliador(m.deps, { lote: 5, janelaDias: 30, revisarMs: 1, intervaloMs: 60_000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(candidatas).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(candidatas).toHaveBeenCalledTimes(2);
      await ligado.parar();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(candidatas).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ligado: uma rodada que falha inteira vira aviso, não derruba o processo", async () => {
    vi.useFakeTimers();
    try {
      const m = montar([]);
      m.deps.placar.candidatas = () => Promise.reject(new Error("banco fora"));
      const ligado = ligarAvaliador(m.deps, { lote: 5, janelaDias: 30, revisarMs: 1, intervaloMs: 60_000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(m.registro.warn).toHaveBeenCalledWith(
        expect.objectContaining({ erro: expect.any(Error) }),
        expect.any(String),
      );
      await ligado.parar();
    } finally {
      vi.useRealTimers();
    }
  });
});
