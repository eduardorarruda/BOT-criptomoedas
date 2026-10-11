import { LIMITE_PERGUNTA } from "@zentrade/contratos/esquemas";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Compositor } from "./Compositor";

function montar(props: Partial<Parameters<typeof Compositor>[0]> = {}) {
  const aoEnviar = vi.fn();
  const aoParar = vi.fn();
  render(<Compositor emAndamento={false} bloqueio={null} aoEnviar={aoEnviar} aoParar={aoParar} {...props} />);
  return { aoEnviar, aoParar, caixa: screen.getByRole("textbox", { name: "Sua pergunta" }) };
}

describe("<Compositor>", () => {
  it("Enter envia o texto limpo e esvazia a caixa", async () => {
    const { aoEnviar, caixa } = montar();
    await userEvent.type(caixa, "  Como estão os robôs?  {Enter}");
    expect(aoEnviar).toHaveBeenCalledWith("Como estão os robôs?");
    expect(caixa).toHaveValue("");
  });

  it("Shift+Enter quebra a linha sem enviar", async () => {
    const { aoEnviar, caixa } = montar();
    await userEvent.type(caixa, "linha 1{Shift>}{Enter}{/Shift}linha 2");
    expect(aoEnviar).not.toHaveBeenCalled();
    expect(caixa).toHaveValue("linha 1\nlinha 2");
  });

  it("Enter durante a composição do teclado (IME) não envia", () => {
    const { aoEnviar, caixa } = montar();
    fireEvent.change(caixa, { target: { value: "にほん" } });
    fireEvent.keyDown(caixa, { key: "Enter", isComposing: true });
    fireEvent.keyDown(caixa, { key: "Enter", keyCode: 229 });
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.keyDown(caixa, { key: "Enter" });
    expect(aoEnviar).toHaveBeenCalledWith("にほん");
  });

  it("caixa vazia não envia e o botão fica desligado", async () => {
    const { aoEnviar, caixa } = montar();
    await userEvent.type(caixa, "   {Enter}");
    expect(aoEnviar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("durante a resposta o botão vira Parar e não envia outra pergunta", async () => {
    const { aoEnviar, aoParar, caixa } = montar({ emAndamento: true });
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
    await userEvent.type(caixa, "outra{Enter}");
    expect(aoEnviar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Parar a resposta" }));
    expect(aoParar).toHaveBeenCalled();
  });

  it("bloqueado mostra o motivo e desliga a caixa", () => {
    const { caixa } = montar({ bloqueio: "Nenhum provedor de IA está configurado." });
    expect(caixa).toBeDisabled();
    expect(caixa).toHaveAccessibleDescription(/Nenhum provedor de IA está configurado/);
    expect(screen.getByText("Nenhum provedor de IA está configurado.")).toBeInTheDocument();
  });

  it("perto do limite mostra quantos caracteres faltam; o limite é o da API", () => {
    const { caixa } = montar();
    expect(caixa).toHaveAttribute("maxLength", String(LIMITE_PERGUNTA));
    expect(screen.queryByText(/caracteres/)).toBeNull();
    fireEvent.change(caixa, { target: { value: "a".repeat(LIMITE_PERGUNTA - 10) } });
    expect(screen.getByText(/restam 10 caracteres/i)).toBeInTheDocument();
  });

  it("texto inicial (sugestão) pode ser enviado direto", async () => {
    const { aoEnviar } = montar();
    await userEvent.click(screen.getByRole("textbox", { name: "Sua pergunta" }));
    await userEvent.keyboard("oi");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(aoEnviar).toHaveBeenCalledWith("oi");
  });
});
