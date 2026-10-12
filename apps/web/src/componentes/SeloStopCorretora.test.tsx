import type { ProtecaoCorretoraDTO } from "@zentrade/contratos/esquemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeloStopCorretora } from "./SeloStopCorretora";

const protecao = (extra: Partial<ProtecaoCorretoraDTO> = {}): ProtecaoCorretoraDTO => ({
  estado: "ATIVA",
  stop: "92.12",
  limite: "91.19",
  alvo: "95.14",
  quantidade: "0.01",
  atualizadaEm: 1_760_000_000_000,
  ...extra,
});

describe("SeloStopCorretora", () => {
  it("stop ativo na corretora: diz o preço do gatilho (no formato de preço da tela) e o alvo", () => {
    render(<SeloStopCorretora protecao={protecao()} aberta />);
    expect(screen.getByText("Ativo a 92,1200")).toBeInTheDocument();
    expect(screen.getByText("Ativo a 92,1200").closest(".selo")).toHaveClass("selo--ganho");
    expect(screen.getByText(/alvo 95,1400/)).toBeInTheDocument();
  });

  it("recusado pela corretora: mostra e explica o motivo", () => {
    render(
      <SeloStopCorretora protecao={protecao({ estado: "REJEITADA", motivo: "Filter failure" })} aberta />,
    );
    const selo = screen.getByText("Recusado").closest(".selo");
    expect(selo).toHaveClass("selo--perda");
    expect(screen.getByTitle(/Filter failure/)).toBeInTheDocument();
  });

  it("sem proteção no livro: só o robô vigia; confirmando enquanto a corretora não responde", () => {
    const { rerender } = render(<SeloStopCorretora aberta />);
    expect(screen.getByText("Só no robô")).toBeInTheDocument();
    rerender(<SeloStopCorretora protecao={protecao({ estado: "PENDENTE" })} aberta />);
    expect(screen.getByText("Confirmando")).toBeInTheDocument();
    rerender(<SeloStopCorretora protecao={protecao({ estado: "CANCELADA" })} aberta />);
    expect(screen.getByText("Fora do livro")).toBeInTheDocument();
  });

  it("posição zerada: nada a proteger", () => {
    render(<SeloStopCorretora protecao={protecao({ estado: "EXECUTADA" })} aberta={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
