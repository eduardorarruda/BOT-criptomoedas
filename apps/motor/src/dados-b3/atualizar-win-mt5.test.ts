import { describe, expect, it } from "vitest";
import { bancoDeCandlesFalso } from "../teste/banco-candles.js";
import { fonteBarrasMt5Falsa } from "../teste/fonte-mt5-falsa.js";
import { atualizarWinMt5 } from "./atualizar-win-mt5.js";
import { meiaNoiteB3 } from "./comandos.js";
import { ErroSimboloContinuoMt5 } from "./simbolo-continuo-mt5.js";

const DIA = "2026-10-14";
const ABERTURA_UTC = meiaNoiteB3(DIA) + 9 * 3_600_000; // 09:00 Brasília
const MIN = 60_000;
const FUSO_BRASILIA = { tipo: "fixo", minutos: 0 } as const;
const AGORA = ABERTURA_UTC + 60 * MIN;

function barraServidor(minutosDesdeAbertura: number, preco: string) {
  return {
    tempoServidorNaive: ABERTURA_UTC + minutosDesdeAbertura * MIN,
    abre: preco,
    maxima: preco,
    minima: preco,
    fecha: preco,
    volume: "10",
  };
}

describe("atualizarWinMt5", () => {
  it("acha o contínuo, converte o horário do servidor para UTC e grava (idempotente)", async () => {
    const { fonte, pedidos } = fonteBarrasMt5Falsa({
      simbolos: ["WIN$N", "WINZ26"],
      barras: [barraServidor(0, "130000"), barraServidor(5, "130100")],
    });
    const b = bancoDeCandlesFalso();

    const r1 = await atualizarWinMt5(
      { fonte, banco: b.banco, agora: () => AGORA },
      { desde: ABERTURA_UTC, ate: AGORA, fusoServidor: FUSO_BRASILIA },
    );
    expect(r1.simboloContinuo).toBe("WIN$N");
    expect(r1.gravados["5m"]).toBe(2);
    // O pedido começa no início do dia de Brasília (dias sempre inteiros).
    expect(pedidos).toEqual([{ simbolo: "WIN$N", intervalo: "5m", de: meiaNoiteB3(DIA), ate: AGORA }]);
    expect(r1.dias).toEqual([
      { data: DIA, contrato: "WIN$N", negocios: 2, negociosUsados: 2, gravados: { "5m": 2 } },
    ]);
    expect(b.de("WIN", "5m").map((k) => k.abertura)).toEqual([ABERTURA_UTC, ABERTURA_UTC + 5 * MIN]);

    // Rodar de novo com as mesmas barras não duplica (upsert pela chave abertura).
    await atualizarWinMt5(
      { fonte, banco: b.banco, agora: () => AGORA },
      { desde: ABERTURA_UTC, ate: AGORA, fusoServidor: FUSO_BRASILIA },
    );
    expect(b.de("WIN", "5m")).toHaveLength(2);
  });

  it("usa o símbolo configurado em vez de adivinhar", async () => {
    const { fonte } = fonteBarrasMt5Falsa({ simbolos: ["WIN$N", "WINM$"], barras: [barraServidor(0, "1")] });
    const b = bancoDeCandlesFalso();
    const r = await atualizarWinMt5(
      { fonte, banco: b.banco, agora: () => AGORA, simboloConfigurado: "WINM$" },
      { desde: ABERTURA_UTC, ate: AGORA, fusoServidor: FUSO_BRASILIA },
    );
    expect(r.simboloContinuo).toBe("WINM$");
  });

  it("servidor adiantado 3h: o fuso aplicado acerta o horário de Brasília nas velas gravadas", async () => {
    const fusoServidor = { tipo: "fixo", minutos: 180 } as const;
    const { fonte } = fonteBarrasMt5Falsa({
      simbolos: ["WIN$N"],
      barras: [{ ...barraServidor(0, "1"), tempoServidorNaive: ABERTURA_UTC + 3 * 3_600_000 }],
    });
    const b = bancoDeCandlesFalso();
    await atualizarWinMt5(
      { fonte, banco: b.banco, agora: () => AGORA },
      { desde: ABERTURA_UTC, ate: AGORA, fusoServidor },
    );
    expect(b.de("WIN", "5m").map((k) => k.abertura)).toEqual([ABERTURA_UTC]);
  });

  it("nenhum contínuo conhecido na corretora: falha com os símbolos disponíveis", async () => {
    const { fonte } = fonteBarrasMt5Falsa({ simbolos: ["WINZ26"], barras: [] });
    const b = bancoDeCandlesFalso();
    await expect(
      atualizarWinMt5(
        { fonte, banco: b.banco, agora: () => AGORA },
        { desde: ABERTURA_UTC, ate: AGORA, fusoServidor: FUSO_BRASILIA },
      ),
    ).rejects.toBeInstanceOf(ErroSimboloContinuoMt5);
  });

  it("sem fuso configurado, detecta pelo dia; e divide períodos longos em janelas de 30 dias", async () => {
    // Servidor adiantado 3 h; a primeira barra do dia é a abertura.
    const barras = [180, 185, 190].map((m) => ({
      ...barraServidor(0, "2"),
      tempoServidorNaive: ABERTURA_UTC + m * MIN,
    }));
    const { fonte, pedidos } = fonteBarrasMt5Falsa({ simbolos: ["WIN$N"], barras });
    const b = bancoDeCandlesFalso();
    const ate = meiaNoiteB3(DIA) + 45 * 86_400_000;
    await atualizarWinMt5(
      { fonte, banco: b.banco, agora: () => ate + 86_400_000 },
      { desde: meiaNoiteB3(DIA), ate, fusoServidor: null },
    );
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1]?.de).toBe(meiaNoiteB3(DIA) + 30 * 86_400_000);
    expect(b.de("WIN", "5m").map((k) => k.abertura)).toEqual([0, 5, 10].map((m) => ABERTURA_UTC + m * MIN));
  });
});
