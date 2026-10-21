import { describe, expect, it } from "vitest";
import { HORA, serieDeAlta } from "../teste/serie-replay.js";
import { pedidoDoReplay } from "./pedido.js";
import { ESTRATEGIA_P1, REPLAY_P1 } from "./p1.js";
import { gerarSinais, type ParametrosSinais } from "./sinais.js";

const INICIO_DADOS = Date.parse("2026-05-01T00:00:00Z");
const candles = serieDeAlta(INICIO_DADOS, 2400);
const inicio = INICIO_DADOS + 400 * HORA;
const fim = INICIO_DADOS + 2300 * HORA;

const parametros = (extra: Partial<ParametrosSinais> = {}): ParametrosSinais => ({
  simbolo: "BTCUSDT",
  candles,
  estrategia: ESTRATEGIA_P1,
  inicio,
  fim,
  nocionalUsd: REPLAY_P1.nocionalUsd,
  horizonte: REPLAY_P1.horizonte,
  janela: REPLAY_P1.janelaIndicadores,
  bpsContra: REPLAY_P1.bpsContra,
  ...extra,
});

describe("P1 (Donchian 20/10 + preço > SMA 200)", () => {
  it("a entrada exige as duas condições e a saída é a do Donchian", () => {
    expect(ESTRATEGIA_P1.entrada).toMatchObject({ tipo: "e" });
    expect(JSON.stringify(ESTRATEGIA_P1.entrada)).toContain('"periodo":200');
    expect(ESTRATEGIA_P1.saida).toBeDefined();
    expect(ESTRATEGIA_P1.stopAtr).toEqual({ periodo: 20, multiplo: 2 });
  });
});

describe("geração dos sinais do replay", () => {
  const sinais = gerarSinais(parametros());

  it("acha sinais e cada um respeita a janela, o candle seguinte e o preço de fechamento", () => {
    expect(sinais.length).toBeGreaterThan(2);
    for (const s of sinais) {
      const vela = candles[s.indice];
      expect(vela?.abertura).toBeGreaterThanOrEqual(inicio);
      expect(s.ate).toBe((vela?.fechamento ?? 0) + 1);
      expect(s.ate).toBe(candles[s.indice + 1]?.abertura);
      expect(s.ate).toBeLessThan(fim);
      expect(s.preco.eq(vela?.fecha ?? 0)).toBe(true);
      expect(s.sinal.acao).toBe("COMPRAR");
    }
  });

  it("só há uma posição da regra pura por vez: o sinal seguinte vem depois da saída do anterior", () => {
    for (const [k, s] of sinais.entries()) {
      const anterior = sinais[k - 1];
      if (anterior?.desfecho.situacao === "concluido")
        expect(candles[s.indice]?.fechamento).toBeGreaterThanOrEqual(anterior.desfecho.em);
    }
  });

  it("não olha o futuro: com os dados cortados, os sinais já resolvidos antes do corte são os mesmos", () => {
    const corte = INICIO_DADOS + 1500 * HORA;
    const curtos = gerarSinais(parametros({ candles: candles.filter((c) => c.fechamento < corte) }));
    const resolvidos = sinais.filter((s) => s.desfecho.situacao === "concluido" && s.desfecho.em < corte);
    expect(resolvidos.length).toBeGreaterThan(1);
    for (const s of resolvidos) {
      const igual = curtos.find((c) => c.indice === s.indice);
      expect(igual?.ate).toBe(s.ate);
      expect(igual?.sinal.explicacao).toBe(s.sinal.explicacao);
      expect(igual?.desfecho).toEqual(s.desfecho);
    }
  });

  it("sem candles na janela ou com a janela depois dos dados, não há sinal", () => {
    expect(gerarSinais(parametros({ candles: [] }))).toEqual([]);
    expect(gerarSinais(parametros({ inicio: INICIO_DADOS + 9000 * HORA }))).toEqual([]);
  });
});

describe("pedido do replay", () => {
  const s = gerarSinais(parametros())[1];
  if (!s) throw new Error("a série de teste precisa de pelo menos 2 sinais");

  it("termina no candle do sinal, leva o `ate` e a operação da estratégia", () => {
    const p = pedidoDoReplay(s, candles, ESTRATEGIA_P1, REPLAY_P1.historicoNoPedido, "1h");
    expect(p.ate).toBe(s.ate);
    expect(p.fechamentos).toHaveLength(Math.min(REPLAY_P1.historicoNoPedido, s.indice + 1));
    expect(p.fechamentos.at(-1)).toBe(candles[s.indice]?.fecha.toNumber());
    expect(p.velas?.instantes.at(-1)).toBe(candles[s.indice]?.abertura);
    expect(Math.max(...(p.velas?.instantes ?? []))).toBeLessThan(s.ate);
    expect(p.operacao?.sentido).toBe("comprado");
    expect(p.operacao?.custos.mercado).toBe("cripto");
    expect(p.posicao.quantidade.isZero()).toBe(true);
    expect(p.robo).toEqual({ id: "replay-btcusdt", simbolo: "BTCUSDT", intervalo: "1h" });
    expect(p.usuarioId).toBeUndefined();
  });
});
