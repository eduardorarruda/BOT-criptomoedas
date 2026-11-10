import { describe, expect, it } from "vitest";
import { MIN, QUINZE, T0, montarCenario } from "./teste/cenario.js";

describe("motor: trava de sinal velho (R2)", () => {
  it("candle que fechou há mais que a idade máxima não abre posição: barrada com o motivo", async () => {
    const c = montarCenario({ idadeMaximaSinalMs: 60_000 });
    await c.aoVivo.iniciar();
    // O candle de T0 fecha em T0 + 15 min, mas chega 5 min depois (reconexão, fila, agente lento).
    c.relogio.definir(T0 + QUINZE + 5 * MIN);
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const [d] = c.decisoes.todas();
    expect(d?.estado).toBe("barrada");
    expect(d?.risco.barreiras[0]?.codigo).toBe("sinal_velho");
    expect(d?.risco.barreiras[0]?.mensagem).toMatch(/fechou há 5 min/);
  });

  it("candle recente segue normalmente", async () => {
    const c = montarCenario({ idadeMaximaSinalMs: 60_000 });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(1);
  });

  it("a saída protegida (stop) não passa pela trava: sai mesmo atrasada", async () => {
    const c = montarCenario({ idadeMaximaSinalMs: 60_000 });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(1);
    c.relogio.definir(T0 + 2 * QUINZE + 5 * MIN);
    await c.fecharIntervalo(50);
    expect(c.ordensEnviadas()).toHaveLength(2);
    expect(c.ordensEnviadas()[1]?.ordem.lado).toBe("VENDA");
  });
});
