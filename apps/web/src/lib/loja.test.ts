import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { criarLoja, useLoja } from "./loja";

describe("loja", () => {
  it("avisa quem assinou só quando o valor muda", () => {
    const loja = criarLoja({ n: 1 });
    const ouvinte = vi.fn();
    const sair = loja.assinar(ouvinte);
    loja.definir((s) => s);
    expect(ouvinte).not.toHaveBeenCalled();
    loja.definir((s) => ({ n: s.n + 1 }));
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(loja.obter().n).toBe(2);
    sair();
    loja.definir(() => ({ n: 9 }));
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it("re-renderiza o componente com o valor selecionado", () => {
    const loja = criarLoja({ preco: "1" });
    const { result } = renderHook(() => useLoja(loja, (s) => s.preco));
    expect(result.current).toBe("1");
    act(() => loja.definir(() => ({ preco: "2" })));
    expect(result.current).toBe("2");
  });
});
