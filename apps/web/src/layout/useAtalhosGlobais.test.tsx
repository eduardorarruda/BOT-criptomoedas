import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAtalhosGlobais } from "./useAtalhosGlobais";

function montar() {
  const abrirPaleta = vi.fn();
  const abrirAjuda = vi.fn();
  const navegar = vi.fn();
  function Teste() {
    useAtalhosGlobais({ abrirPaleta, abrirAjuda, navegar });
    return (
      <>
        <input aria-label="campo" />
        <dialog aria-label="dialogo">
          <button type="button">x</button>
        </dialog>
      </>
    );
  }
  const r = render(<Teste />);
  return { ...r, abrirPaleta, abrirAjuda, navegar };
}

describe("useAtalhosGlobais", () => {
  it("Ctrl+Shift+P e Cmd+Shift+P abrem a paleta", () => {
    const { abrirPaleta } = montar();
    fireEvent.keyDown(document.body, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document.body, { key: "p", metaKey: true, shiftKey: true });
    expect(abrirPaleta).toHaveBeenCalledTimes(2);
  });

  it('"/" abre a paleta e "?" abre a ajuda', () => {
    const { abrirPaleta, abrirAjuda } = montar();
    fireEvent.keyDown(document.body, { key: "/" });
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    expect(abrirPaleta).toHaveBeenCalledTimes(1);
    expect(abrirAjuda).toHaveBeenCalledTimes(1);
  });

  it("g e uma letra navegam", () => {
    const { navegar } = montar();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "r" });
    expect(navegar).toHaveBeenCalledWith("/robos");
  });

  it("letra sem o g antes não navega, e o g vence em pouco tempo", () => {
    vi.useFakeTimers();
    const { navegar } = montar();
    fireEvent.keyDown(document.body, { key: "r" });
    fireEvent.keyDown(document.body, { key: "g" });
    vi.advanceTimersByTime(2000);
    fireEvent.keyDown(document.body, { key: "r" });
    expect(navegar).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("digitando num campo, nada dispara (só Ctrl+Shift+P)", () => {
    const { getByLabelText, abrirPaleta, abrirAjuda, navegar } = montar();
    const campo = getByLabelText("campo");
    fireEvent.keyDown(campo, { key: "/" });
    fireEvent.keyDown(campo, { key: "?", shiftKey: true });
    fireEvent.keyDown(campo, { key: "g" });
    fireEvent.keyDown(campo, { key: "r" });
    expect(abrirPaleta).not.toHaveBeenCalled();
    expect(abrirAjuda).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
    fireEvent.keyDown(campo, { key: "P", ctrlKey: true, shiftKey: true });
    expect(abrirPaleta).toHaveBeenCalledTimes(1);
  });

  it("com um diálogo aberto, as teclas soltas não disparam", () => {
    const { getByLabelText, abrirPaleta } = montar();
    getByLabelText("dialogo").setAttribute("open", "");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(abrirPaleta).not.toHaveBeenCalled();
  });
});
