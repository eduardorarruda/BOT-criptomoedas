import { describe, expect, it } from "vitest";
import { RelogioManual, RelogioSistema, dormirReal } from "./relogio.js";

describe("relógios", () => {
  it("o do sistema acompanha Date.now", () => {
    const antes = Date.now();
    expect(new RelogioSistema().agora()).toBeGreaterThanOrEqual(antes);
  });

  it("o manual só anda quando mandam", async () => {
    const r = new RelogioManual(10);
    r.avancar(5);
    expect(r.agora()).toBe(15);
    r.definir(100);
    expect(r.agora()).toBe(100);
    await r.dormir(50);
    expect(r.agora()).toBe(150);
  });

  it("dormir de verdade espera", async () => {
    const antes = Date.now();
    await dormirReal(15);
    expect(Date.now() - antes).toBeGreaterThanOrEqual(10);
  });
});
