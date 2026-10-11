import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CHAVE_TEMA, temaInicial, useTema } from "./tema";

function simularSistema(claro: boolean) {
  const ouvintes: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches: claro,
    media: "(prefers-color-scheme: light)",
    addEventListener: (_: string, f: (e: MediaQueryListEvent) => void) => ouvintes.push(f),
    removeEventListener: vi.fn(),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList);
  return {
    mudar(novoClaro: boolean) {
      mql.matches = novoClaro;
      ouvintes.forEach((f) => f({ matches: novoClaro } as MediaQueryListEvent));
    },
  };
}

describe("tema", () => {
  it("é escuro por padrão quando o sistema não pede claro", () => {
    simularSistema(false);
    expect(temaInicial()).toBe("escuro");
  });

  it("segue o sistema quando ele pede claro", () => {
    simularSistema(true);
    expect(temaInicial()).toBe("claro");
  });

  it("a escolha salva vence o sistema", () => {
    simularSistema(true);
    localStorage.setItem(CHAVE_TEMA, "escuro");
    expect(temaInicial()).toBe("escuro");
  });

  it("alterna, aplica no documento e lembra a escolha", () => {
    simularSistema(false);
    const { result } = renderHook(() => useTema());
    expect(result.current.tema).toBe("escuro");
    act(() => result.current.alternar());
    expect(result.current.tema).toBe("claro");
    expect(document.documentElement.dataset.tema).toBe("claro");
    expect(localStorage.getItem(CHAVE_TEMA)).toBe("claro");
    act(() => result.current.alternar());
    expect(document.documentElement.dataset.tema).toBe("escuro");
  });

  it("acompanha a mudança do sistema enquanto a pessoa não escolheu", () => {
    const sistema = simularSistema(false);
    const { result } = renderHook(() => useTema());
    act(() => sistema.mudar(true));
    expect(result.current.tema).toBe("claro");
  });

  it("ignora a mudança do sistema depois de uma escolha", () => {
    const sistema = simularSistema(false);
    const { result } = renderHook(() => useTema());
    act(() => result.current.alternar());
    act(() => sistema.mudar(false));
    expect(result.current.tema).toBe("claro");
  });

  it("volta a seguir o sistema", () => {
    simularSistema(true);
    localStorage.setItem(CHAVE_TEMA, "escuro");
    const { result } = renderHook(() => useTema());
    act(() => result.current.seguirSistema());
    expect(result.current.tema).toBe("claro");
    expect(localStorage.getItem(CHAVE_TEMA)).toBeNull();
    expect(document.documentElement.dataset.tema).toBeUndefined();
  });

  it("funciona mesmo sem armazenamento disponível", () => {
    simularSistema(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(temaInicial()).toBe("escuro");
  });
});
