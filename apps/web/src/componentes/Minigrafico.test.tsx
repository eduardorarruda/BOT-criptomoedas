import { render } from "@testing-library/react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { caminhoMinigrafico, Minigrafico, tomDaSerie } from "./Minigrafico";

const comMovimento = (ui: ReactElement) =>
  render(
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="always">{ui}</MotionConfig>
    </LazyMotion>,
  );

describe("Minigrafico", () => {
  it("normaliza a série na caixa: o menor valor embaixo, o maior em cima", () => {
    const d = caminhoMinigrafico([0, 10], 100, 20);
    expect(d).toBe("M2.00 18.00 L98.00 2.00");
  });

  it("série constante vira uma reta no meio", () => {
    expect(caminhoMinigrafico([5, 5, 5], 100, 20)).toBe("M2.00 10.00 L50.00 10.00 L98.00 10.00");
    expect(caminhoMinigrafico([], 100, 20)).toBe("");
  });

  it("o tom automático segue o fim contra o começo", () => {
    expect(tomDaSerie([1, 3])).toBe("ganho");
    expect(tomDaSerie([3, 1])).toBe("perda");
    expect(tomDaSerie([2, 9, 2])).toBe("neutro");
    expect(tomDaSerie([])).toBe("neutro");
  });

  it("é decorativo por padrão e só vira imagem com rótulo", () => {
    const { container, rerender } = comMovimento(<Minigrafico valores={[1, 2, 3]} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("minigrafico--ganho");
    rerender(
      <LazyMotion features={domAnimation}>
        <Minigrafico valores={[3, 2, 1]} rotulo="Patrimônio caiu em 30 dias" tom="atencao" />
      </LazyMotion>,
    );
    const rotulado = container.querySelector("svg")!;
    expect(rotulado).toHaveAttribute("role", "img");
    expect(rotulado).toHaveAccessibleName("Patrimônio caiu em 30 dias");
    expect(rotulado).toHaveClass("minigrafico--atencao");
  });

  it("não desenha nada com menos de dois pontos", () => {
    const { container } = comMovimento(<Minigrafico valores={[1]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
