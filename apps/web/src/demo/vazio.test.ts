import { describe, expect, it } from "vitest";
import { lerModoVazio } from "./vazio";

function armazenamento(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("lerModoVazio", () => {
  it("fica desligado sem o parâmetro", () => {
    expect(lerModoVazio("", armazenamento())).toBe(false);
  });

  it("?vazio=1 liga e a aba lembra nas próximas telas", () => {
    const a = armazenamento();
    expect(lerModoVazio("?vazio=1", a)).toBe(true);
    expect(lerModoVazio("?robo=x", a)).toBe(true);
  });

  it("?vazio=0 desliga", () => {
    const a = armazenamento();
    lerModoVazio("?vazio=1", a);
    expect(lerModoVazio("?vazio=0", a)).toBe(false);
    expect(lerModoVazio("", a)).toBe(false);
  });

  it("sem armazenamento, vale só o parâmetro", () => {
    expect(lerModoVazio("?vazio=1", undefined)).toBe(true);
    expect(lerModoVazio("", undefined)).toBe(false);
  });
});
