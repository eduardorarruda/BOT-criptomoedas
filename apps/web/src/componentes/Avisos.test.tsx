import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorAvisos, useAvisos } from "./Avisos";

function Disparar({ comAcao, aoDesfazer }: { readonly comAcao?: boolean; readonly aoDesfazer?: () => void }) {
  const avisar = useAvisos();
  return (
    <button
      type="button"
      onClick={() =>
        avisar(
          "sucesso",
          "Robô pausado.",
          comAcao ? { rotulo: "Desfazer", executar: aoDesfazer ?? (() => undefined) } : undefined,
        )
      }
    >
      disparar
    </button>
  );
}

/** A saída anima em tempo real: depois de avançar o relógio do aviso, espera o item sair. */
async function esperarSumir(texto: string) {
  vi.useRealTimers();
  await waitFor(() => expect(screen.queryByText(texto)).not.toBeInTheDocument());
}

function montar(ui: React.ReactElement) {
  return render(
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="always">
        <ProvedorAvisos>{ui}</ProvedorAvisos>
      </MotionConfig>
    </LazyMotion>,
  );
}

describe("Avisos", () => {
  // Só o relógio dos avisos é falso; a animação (requestAnimationFrame) segue o tempo real.
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("aviso com ação mostra o botão; clicar executa e fecha", async () => {
    const desfazer = vi.fn();
    montar(<Disparar comAcao aoDesfazer={desfazer} />);
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(desfazer).toHaveBeenCalledTimes(1);
    await esperarSumir("Robô pausado.");
  });

  it("aviso com ação fica mais tempo que o simples (dá tempo de desfazer)", async () => {
    montar(<Disparar comAcao />);
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText("Robô pausado.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    await esperarSumir("Robô pausado.");
  });

  it("com o ponteiro em cima, o tempo para; ao sair, volta a contar", async () => {
    montar(<Disparar />);
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    const lista = screen.getByRole("list", { name: "Avisos" });
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.pointerEnter(lista);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText("Robô pausado.")).toBeInTheDocument();
    fireEvent.pointerLeave(lista);
    act(() => vi.advanceTimersByTime(3000));
    await esperarSumir("Robô pausado.");
  });

  it("com o foco dentro (teclado), o tempo também para", () => {
    montar(<Disparar comAcao />);
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    fireEvent.focus(screen.getByRole("button", { name: "Desfazer" }));
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("Robô pausado.")).toBeInTheDocument();
  });

  it("depois de usar o botão pelo teclado (o foco some com o aviso), o próximo aviso ainda some sozinho", async () => {
    montar(<Disparar comAcao />);
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    const desfazer = screen.getByRole("button", { name: "Desfazer" });
    fireEvent.focus(desfazer);
    fireEvent.click(desfazer);
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    act(() => vi.advanceTimersByTime(11_000));
    await esperarSumir("Robô pausado.");
  });
});
