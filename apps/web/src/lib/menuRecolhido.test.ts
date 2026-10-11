import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAVE_MENU, lerMenuRecolhido, useMenuRecolhido } from "./menuRecolhido";

describe("menu recolhido", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("começa aberto quando não há escolha salva", () => {
    expect(lerMenuRecolhido()).toBe(false);
    const { result } = renderHook(() => useMenuRecolhido());
    expect(result.current.recolhido).toBe(false);
  });

  it("lembra a escolha entre visitas", () => {
    localStorage.setItem(CHAVE_MENU, "1");
    const { result } = renderHook(() => useMenuRecolhido());
    expect(result.current.recolhido).toBe(true);
  });

  it("alterna e grava; abrir de novo apaga a escolha", () => {
    const { result } = renderHook(() => useMenuRecolhido());
    act(() => result.current.alternar());
    expect(result.current.recolhido).toBe(true);
    expect(localStorage.getItem(CHAVE_MENU)).toBe("1");
    act(() => result.current.alternar());
    expect(result.current.recolhido).toBe(false);
    expect(localStorage.getItem(CHAVE_MENU)).toBeNull();
  });

  it("sem armazenamento, funciona só na visita", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(lerMenuRecolhido()).toBe(false);
    const { result } = renderHook(() => useMenuRecolhido());
    act(() => result.current.alternar());
    expect(result.current.recolhido).toBe(true);
  });
});
