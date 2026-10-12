import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { conferirSaldo, POEIRA_USD, TOLERANCIA_RELATIVA } from "./reconciliacao.js";

const base = { ativo: "BTC", esperado: dec("0.1"), livre: dec("0.1"), bloqueado: dec(0), preco: dec(60_000) };

describe("conferência do saldo com a corretora", () => {
  it("saldo igual ao esperado não diverge", () => {
    const r = conferirSaldo(base);
    expect(r.divergente).toBe(false);
    expect(r.falta.toFixed()).toBe("0");
  });

  it("conta o bloqueado (stop na corretora) como saldo da pessoa", () => {
    const r = conferirSaldo({ ...base, livre: dec("0.02"), bloqueado: dec("0.08") });
    expect(r.divergente).toBe(false);
    expect(r.naCorretora.toFixed()).toBe("0.1");
  });

  it("tolera a taxa cobrada no ativo e a poeira", () => {
    // 0,5% de 0,1 BTC = 0,0005 BTC
    expect(conferirSaldo({ ...base, livre: dec("0.0995") }).divergente).toBe(false);
    expect(conferirSaldo({ ...base, livre: dec("0.0994") }).divergente).toBe(true);
    expect(TOLERANCIA_RELATIVA.toFixed()).toBe("0.005");
  });

  it("para posições pequenas vale a poeira em dólar", () => {
    const pequena = { ...base, esperado: dec("0.0001"), preco: dec(60_000) }; // US$ 6
    // poeira: US$ 1 / 60.000 ≈ 0,0000167 BTC
    expect(conferirSaldo({ ...pequena, livre: dec("0.000085") }).divergente).toBe(false);
    expect(conferirSaldo({ ...pequena, livre: dec("0.00008") }).divergente).toBe(true);
    expect(POEIRA_USD.toFixed()).toBe("1");
  });

  it("sem preço conhecido, só a tolerância relativa vale", () => {
    const r = conferirSaldo({ ...base, preco: null, livre: dec("0.0994") });
    expect(r.divergente).toBe(true);
    expect(r.tolerancia.toFixed()).toBe("0.0005");
  });

  it("saldo a mais na corretora não é divergência (moedas da pessoa fora dos robôs)", () => {
    const r = conferirSaldo({ ...base, livre: dec(5) });
    expect(r.divergente).toBe(false);
    expect(r.falta.toFixed()).toBe("0");
  });

  it("falta toda a posição: diverge com a falta inteira", () => {
    const r = conferirSaldo({ ...base, livre: dec(0) });
    expect(r.divergente).toBe(true);
    expect(r.falta.toFixed()).toBe("0.1");
  });
});
