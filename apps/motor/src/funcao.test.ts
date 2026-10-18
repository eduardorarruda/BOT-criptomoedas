import { describe, expect, it } from "vitest";
import { lerConfig } from "./config.js";
import { papeisDoMotor } from "./funcao.js";

describe("função do processo do motor", () => {
  it("tudo: robôs e backtests no mesmo processo (instalação simples)", () => {
    expect(papeisDoMotor("tudo")).toEqual({ robos: true, backtests: true });
  });

  it("separados: backtest pesado não atrasa os robôs ao vivo", () => {
    expect(papeisDoMotor("robos")).toEqual({ robos: true, backtests: false });
    expect(papeisDoMotor("backtests")).toEqual({ robos: false, backtests: true });
  });

  it("padrão é tudo; valor desconhecido é recusado", () => {
    expect(lerConfig({}).MOTOR_FUNCAO).toBe("tudo");
    expect(() => lerConfig({ MOTOR_FUNCAO: "outra" })).toThrow();
  });
});
