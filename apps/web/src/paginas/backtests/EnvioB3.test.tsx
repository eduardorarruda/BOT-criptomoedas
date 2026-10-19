import type { ImportacaoB3DTO } from "@zentrade/contratos/esquemas";
import { configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import type { ApiImportacaoB3 } from "./apiB3";
import { EnvioB3 } from "./EnvioB3";

configure({ asyncUtilTimeout: 10_000 });

const fonte = { demo: false } as Fonte;

const naFila: ImportacaoB3DTO = {
  id: "imp-1",
  nomeArquivo: "negocios.zip",
  estado: "na_fila",
  resumo: null,
  erro: null,
  criadoEm: Date.UTC(2026, 9, 14),
  concluidoEm: null,
};

function apiFalsa(sequencia: readonly ImportacaoB3DTO[]): ApiImportacaoB3 {
  let i = -1;
  return {
    listar: vi.fn(async () => [naFila]),
    atualizarMt5: vi.fn(async () => naFila),
    obter: vi.fn(async () => {
      i = Math.min(i + 1, sequencia.length - 1);
      return sequencia[i]!;
    }),
    enviar: vi.fn(async (_a: File, aoProgresso: (p: number) => void) => {
      aoProgresso(0.5);
      aoProgresso(1);
      return naFila;
    }),
  };
}

describe("EnvioB3", () => {
  it("envia o .zip solto na área, acompanha a fila até concluir e mostra o resumo dos dias", async () => {
    const concluida: ImportacaoB3DTO = {
      ...naFila,
      estado: "concluida",
      resumo: {
        dias: [
          { data: "2026-10-14", contrato: "WINZ26", negocios: 10, negociosUsados: 9, gravados: { "5m": 4 } },
        ],
      },
      concluidoEm: Date.UTC(2026, 9, 14, 1),
    };
    const api = apiFalsa([naFila, concluida]);
    const aoConcluir = vi.fn();
    renderizar(<EnvioB3 api={api} aoConcluir={aoConcluir} />, fonte);
    const zona = (await screen.findByText(/Arraste os \.zip da B3/)).closest(".upb3__zona")!;
    const zip = new File(["PK\x03\x04"], "negocios.zip", { type: "application/zip" });
    fireEvent.drop(zona, { dataTransfer: { files: [zip] } });

    expect(api.enviar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/1 pregão: 2026-10-14/)).toBeInTheDocument(), {
      timeout: 15_000,
      interval: 50,
    });
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("recusa extensão errada antes de enviar (sem chamar a API)", async () => {
    const api = apiFalsa([naFila]);
    renderizar(<EnvioB3 api={api} />, fonte);
    const zona = (await screen.findByText(/Arraste os \.zip da B3/)).closest(".upb3__zona")!;
    const ruim = new File(["x"], "negocios.txt");
    fireEvent.drop(zona, { dataTransfer: { files: [ruim] } });
    expect(await screen.findByText(/Envie o \.zip baixado no BDI/)).toBeInTheDocument();
    expect(api.enviar).not.toHaveBeenCalled();
  });

  it("falha do motor: mostra o erro legível gravado na importação", async () => {
    const falhou: ImportacaoB3DTO = {
      ...naFila,
      estado: "falhou",
      erro: "o .zip não tem um .txt dentro",
    };
    const api = apiFalsa([falhou]);
    renderizar(<EnvioB3 api={api} />, fonte);
    const zona = (await screen.findByText(/Arraste os \.zip da B3/)).closest(".upb3__zona")!;
    fireEvent.drop(zona, { dataTransfer: { files: [new File(["PK\x03\x04"], "d.zip")] } });
    expect(
      await screen.findByText("o .zip não tem um .txt dentro", {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
  });
});
