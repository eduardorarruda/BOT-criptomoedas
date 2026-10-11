import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotaoSegurar } from "./BotaoSegurar";

describe("BotaoSegurar (parada total)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function montar() {
    const aoConfirmar = vi.fn();
    render(<BotaoSegurar aoConfirmar={aoConfirmar}>Parar tudo</BotaoSegurar>);
    return { aoConfirmar, botao: screen.getByRole("button", { name: /parar tudo/i }) };
  }

  it("confirma só depois de segurar 1,5 s", () => {
    const { aoConfirmar, botao } = montar();
    fireEvent.pointerDown(botao, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(1499));
    expect(aoConfirmar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
  });

  it("um clique rápido não confirma e explica o que fazer", () => {
    const { aoConfirmar, botao } = montar();
    fireEvent.pointerDown(botao, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(botao, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(3000));
    expect(aoConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText(/soltou antes da hora/i)).toBeInTheDocument();
  });

  it("soltar no meio cancela, e segurar de novo recomeça do zero", () => {
    const { aoConfirmar, botao } = montar();
    fireEvent.pointerDown(botao, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.pointerCancel(botao, { pointerId: 1 });
    fireEvent.pointerDown(botao, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(1000));
    expect(aoConfirmar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
  });

  it("funciona pelo teclado segurando Espaço, ignorando a repetição da tecla", () => {
    const { aoConfirmar, botao } = montar();
    fireEvent.keyDown(botao, { key: " " });
    act(() => vi.advanceTimersByTime(700));
    fireEvent.keyDown(botao, { key: " ", repeat: true });
    act(() => vi.advanceTimersByTime(800));
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
  });

  it("soltar Enter antes da hora cancela", () => {
    const { aoConfirmar, botao } = montar();
    fireEvent.keyDown(botao, { key: "Enter" });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyUp(botao, { key: "Enter" });
    act(() => vi.advanceTimersByTime(1000));
    expect(aoConfirmar).not.toHaveBeenCalled();
  });

  it("ignora outras teclas, botão direito e quando está desabilitado", () => {
    const aoConfirmar = vi.fn();
    const { rerender } = render(<BotaoSegurar aoConfirmar={aoConfirmar}>Parar</BotaoSegurar>);
    const botao = screen.getByRole("button", { name: "Parar" });
    fireEvent.keyDown(botao, { key: "a" });
    fireEvent.pointerDown(botao, { button: 2, pointerId: 1 });
    act(() => vi.advanceTimersByTime(2000));
    rerender(
      <BotaoSegurar aoConfirmar={aoConfirmar} desabilitado>
        Parar
      </BotaoSegurar>,
    );
    fireEvent.keyDown(botao, { key: " " });
    act(() => vi.advanceTimersByTime(2000));
    expect(aoConfirmar).not.toHaveBeenCalled();
  });

  it("descreve como usar para leitores de tela", () => {
    const { botao } = montar();
    expect(botao).toHaveAccessibleDescription(/segure por 1,5 s/i);
  });
});
