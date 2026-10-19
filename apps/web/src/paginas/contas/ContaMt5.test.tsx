import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ESTADO_MT5_VAZIO, type EstadoMt5 } from "@zentrade/contratos/esquemas";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import type { ApiMt5 } from "./apiMt5";
import { ContaMt5 } from "./ContaMt5";

configure({ asyncUtilTimeout: 10_000 });

const configurada: EstadoMt5 = {
  configurado: true,
  loginFinal: "…4567",
  simboloContinuo: "WIN$N",
  fusoServidor: null,
  criadaEm: Date.UTC(2026, 9, 14),
  validadaEm: null,
  ultimoErro: null,
};

function apiFalsa(inicial: EstadoMt5) {
  let estado = inicial;
  const api: ApiMt5 = {
    estado: vi.fn(async () => estado),
    salvar: vi.fn(async () => (estado = configurada)),
    remover: vi.fn(async () => void (estado = ESTADO_MT5_VAZIO)),
    testar: vi.fn(async () => ({ ok: true, simbolos: ["WIN$N", "WINZ26"], erro: null })),
  };
  return api;
}

describe("ContaMt5 (Contas e chaves)", () => {
  it("guarda a conta demo, valida o login e nunca mostra a senha de volta", async () => {
    const api = apiFalsa(ESTADO_MT5_VAZIO);
    renderizar(<ContaMt5 api={api} />, { demo: false } as Fonte);
    await userEvent.type(await screen.findByLabelText("Servidor"), "Clear-Demo");
    await userEvent.type(screen.getByLabelText("Login"), "abc");
    await userEvent.type(screen.getByLabelText("Senha da conta demo"), "segredo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar conta" }));
    expect(await screen.findByText(/login do MetaTrader 5 é um número/)).toBeInTheDocument();
    expect(api.salvar).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText("Login"));
    await userEvent.type(screen.getByLabelText("Login"), "1234567");
    await userEvent.click(screen.getByRole("button", { name: "Guardar conta" }));
    await waitFor(() =>
      expect(api.salvar).toHaveBeenCalledWith({ servidor: "Clear-Demo", login: "1234567", senha: "segredo" }),
    );
    expect(await screen.findByText("…4567")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("segredo");
  });

  it("testa a conexão e lista os símbolos; remove com confirmação", async () => {
    const api = apiFalsa(configurada);
    renderizar(<ContaMt5 api={api} />, { demo: false } as Fonte);
    await userEvent.click(await screen.findByRole("button", { name: "Testar conexão" }));
    expect(await screen.findByText(/WIN\$N, WINZ26/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remover" }));
    await userEvent.click(screen.getByRole("button", { name: "Remover conta" }));
    await waitFor(() => expect(api.remover).toHaveBeenCalled());
  });

  it("em modo demonstração, só avisa que precisa da API", async () => {
    renderizar(<ContaMt5 api={apiFalsa(ESTADO_MT5_VAZIO)} />, { demo: true } as Fonte);
    expect(await screen.findByText(/fora do modo de demonstração/)).toBeInTheDocument();
  });
});
