import { describe, expect, it } from "vitest";
import {
  CAMPOS_WIN_INICIAIS,
  configuracaoWinDoFormulario,
  errosWin,
  janelaWin,
  lerInteiro,
  lerReais,
} from "./formularioWin";

const validacao = {
  fracaoDentroDaAmostra: 0.7,
  janelas: 5,
  modoJanelas: "rolante" as const,
  limiteRuina: 0.3,
};

describe("formulário do mini índice", () => {
  it("reais com vírgula ou ponto, e milhar brasileiro", () => {
    expect(lerReais("0,25")).toBe("0.25");
    expect(lerReais("1.234,50")).toBe("1234.50");
    expect(lerReais("155")).toBe("155");
    expect(lerReais("-1")).toBeNull();
    expect(lerReais("abc")).toBeNull();
    expect(lerReais("0", { positivo: true })).toBeNull();
    expect(lerInteiro("3", 0, 20)).toBe(3);
    expect(lerInteiro("1,5", 0, 20)).toBeNull();
  });

  it("padrões sem erro; horários fora de ordem e valores inválidos explicam", () => {
    expect(errosWin(CAMPOS_WIN_INICIAIS)).toEqual({});
    const e = errosWin({ ...CAMPOS_WIN_INICIAIS, ticks: "30", margem: "0", inicioEntradas: "18:00" });
    expect(e.ticks).toBe("de 0 a 20 ticks");
    expect(e.margem).toBe("em reais, maior que zero");
    expect(e.zeragem).toMatch(/início das entradas precisa ser antes do corte/);
  });

  it("configuração do pedido: mercado win, capital, limites e o modelo do WIN", () => {
    const c = configuracaoWinDoFormulario(
      { ...CAMPOS_WIN_INICIAIS, corretagem: "0,50", limites: "sem" },
      validacao,
    );
    expect(c).toMatchObject({
      mercado: "win",
      saldoInicial: "5000",
      risco: { modo: "sem_limites" },
      win: { corretagemPorContrato: "0.50", tarifaB3PorContrato: "0.25", riscoPorOperacao: "100" },
    });
  });

  it("filtro de dias de evento: padrão ignorar; o escolhido vai para a configuração", () => {
    expect(configuracaoWinDoFormulario(CAMPOS_WIN_INICIAIS, validacao).diasDeEvento).toBe("ignorar");
    expect(
      configuracaoWinDoFormulario(CAMPOS_WIN_INICIAIS, validacao, "fechamento", "bloquear").diasDeEvento,
    ).toBe("bloquear");
  });

  it("janela: termina no último candle gravado e não começa antes do primeiro", () => {
    const DIA = 86_400_000;
    const dados = {
      simbolo: "WIN" as const,
      intervalo: "5m" as const,
      primeiro: 10 * DIA,
      ultimo: 100 * DIA,
      candles: 9,
    };
    expect(janelaWin([dados], "WIN", "5m", 30)).toEqual({
      inicio: 100 * DIA + 300_000 - 30 * DIA,
      fim: 100 * DIA + 300_000,
      dados,
    });
    expect(janelaWin([dados], "WIN", "5m", 730)?.inicio).toBe(10 * DIA);
    expect(janelaWin([dados], "WIN-IBOV", "5m", 30)).toBeNull();
  });
});
