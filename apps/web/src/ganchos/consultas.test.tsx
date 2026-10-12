import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { criarFonteDemo } from "../demo/fonteDemo";
import { criarEnvoltorio } from "../teste/envoltorio";
import * as c from "./consultas";

const fonte = () => criarFonteDemo({ latenciaMs: [0, 0] });

describe("consultas", () => {
  it("carrega cada recurso pela fonte", async () => {
    const { Envoltorio } = criarEnvoltorio(fonte());
    const { result } = renderHook(
      () => ({
        sessao: c.useSessao(),
        resumo: c.useResumo(),
        patrimonio: c.usePatrimonio(),
        saude: c.useSaude(),
        estrategias: c.useEstrategias(),
        robos: c.useRobos(),
        posicoes: c.usePosicoes(["r-sol", "r-btc"]),
        decisoes: c.useDecisoes({ estado: "barrada" }),
        ordens: c.useOrdens("r-sol"),
        candles: c.useCandles("ETHUSDT", "4h"),
        contas: c.useContas(),
        tokens: c.useTokens(),
        backtests: c.useBacktests(),
        documentos: c.useDocumentos(),
        automacoes: c.useAutomacoes(),
      }),
      { wrapper: Envoltorio },
    );
    await waitFor(() => expect(result.current.automacoes.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.candles.isSuccess).toBe(true));
    const r = result.current;
    expect(r.sessao.data).toBeNull();
    expect(r.resumo.data?.robosAtivos).toBe(3);
    expect(r.patrimonio.data).toHaveLength(120);
    expect(r.saude.data?.ok).toBe(true);
    expect(r.estrategias.data).toHaveLength(3);
    expect(r.robos.data).toHaveLength(4);
    expect(r.posicoes.map((p) => p.data?.roboId)).toEqual(["r-sol", "r-btc"]);
    expect(r.decisoes.data?.every((d) => d.estado === "barrada")).toBe(true);
    expect(r.ordens.data?.length).toBeGreaterThan(3);
    expect(r.ordens.data?.every((o) => o.idCliente.startsWith("zt-d-"))).toBe(true);
    expect(r.candles.data).toHaveLength(240);
    expect(r.contas.data).toHaveLength(1);
    expect(r.tokens.data).toHaveLength(2);
    expect(r.backtests.data).toHaveLength(4);
    expect(r.documentos.data).toHaveLength(8);
  });
});
