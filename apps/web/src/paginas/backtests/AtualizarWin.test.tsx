import { configure, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportacaoB3DTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import type { ApiImportacaoB3 } from "./apiB3";
import { AtualizarWin } from "./AtualizarWin";

configure({ asyncUtilTimeout: 10_000 });

const base: ImportacaoB3DTO = {
  id: "imp-1",
  nomeArquivo: "MetaTrader 5 (WIN)",
  estado: "na_fila",
  resumo: null,
  erro: null,
  criadoEm: 1,
  concluidoEm: null,
};
const api = (final: ImportacaoB3DTO): ApiImportacaoB3 => ({
  listar: vi.fn(async () => []),
  enviar: vi.fn(async () => base),
  atualizarMt5: vi.fn(async () => base),
  obter: vi.fn(async () => final),
});

describe("AtualizarWin", () => {
  it("pede a atualização, acompanha o motor e mostra quantos pregões entraram", async () => {
    const concluida: ImportacaoB3DTO = {
      ...base,
      estado: "concluida",
      resumo: {
        dias: [
          { data: "2026-10-14", contrato: "WIN$N", negocios: 1, negociosUsados: 1, gravados: { "5m": 1 } },
        ],
      },
    };
    const aoConcluir = vi.fn();
    renderizar(<AtualizarWin api={api(concluida)} intervaloMs={5} aoConcluir={aoConcluir} />, {
      demo: false,
    } as Fonte);
    await userEvent.click(screen.getByRole("button", { name: "Atualizar dados do WIN" }));
    expect(await screen.findByText(/1 pregões atualizados/)).toBeInTheDocument();
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("falha do motor: mostra o erro legível", async () => {
    const falhou: ImportacaoB3DTO = {
      ...base,
      estado: "falhou",
      erro: "cadastre a conta demo do MetaTrader 5",
    };
    renderizar(<AtualizarWin api={api(falhou)} intervaloMs={5} />, { demo: false } as Fonte);
    await userEvent.click(screen.getByRole("button", { name: "Atualizar dados do WIN" }));
    expect(await screen.findByText(/cadastre a conta demo/)).toBeInTheDocument();
  });
});
