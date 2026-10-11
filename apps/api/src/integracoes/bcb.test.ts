import { describe, expect, it, vi } from "vitest";
import { criarClienteBcb, ErroBcb, janelas } from "./bcb.js";

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("cliente do SGS (fetch simulado, nunca o Banco Central de verdade)", () => {
  it("monta a URL com datas dd/mm/aaaa e converte para AAAA-MM-DD", async () => {
    const buscar = vi.fn(async () =>
      resposta(200, [
        { data: "08/10/2026", valor: "0.050788" },
        { data: "01/09/2026", dataFim: "01/10/2026", valor: "0.6698" },
      ]),
    );
    const cliente = criarClienteBcb({ fetch: buscar as unknown as typeof fetch });
    const pontos = await cliente.serie(12, "2026-10-01", "2026-10-11");
    expect(buscar).toHaveBeenCalledOnce();
    expect(String((buscar.mock.calls[0] as unknown[])[0])).toBe(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=01/10/2026&dataFinal=11/10/2026",
    );
    expect(pontos).toEqual([
      { dia: "2026-10-08", valor: "0.050788", diaFim: null },
      { dia: "2026-09-01", valor: "0.6698", diaFim: "2026-10-01" },
    ]);
  });

  it("períodos longos viram várias consultas de até 9 anos", async () => {
    expect(janelas("2008-01-01", "2026-10-11")).toEqual([
      ["2008-01-01", "2017-01-01"],
      ["2017-01-02", "2026-01-02"],
      ["2026-01-03", "2026-10-11"],
    ]);
    const buscar = vi.fn(async () => resposta(200, []));
    await criarClienteBcb({ fetch: buscar as unknown as typeof fetch }).serie(12, "2008-01-01", "2026-10-11");
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it("404 do SGS é período sem dado, não erro", async () => {
    const cliente = criarClienteBcb({
      fetch: (async () => resposta(404, { erro: "Value(s) not found" })) as unknown as typeof fetch,
    });
    expect(await cliente.serie(12, "2026-10-10", "2026-10-11")).toEqual([]);
  });

  it("erro de servidor, formato estranho e rede fora viram ErroBcb com explicação", async () => {
    const com = (f: () => Promise<Response>) => criarClienteBcb({ fetch: f as unknown as typeof fetch });
    await expect(com(async () => resposta(500, {})).serie(12, "2026-10-01", "2026-10-02")).rejects.toThrow(
      /respondeu 500/,
    );
    await expect(
      com(async () => resposta(200, [{ data: "x", valor: "1" }])).serie(12, "2026-10-01", "2026-10-02"),
    ).rejects.toThrow(/formato inesperado/);
    await expect(
      com(async () => {
        throw new TypeError("fetch failed");
      }).serie(12, "2026-10-01", "2026-10-02"),
    ).rejects.toBeInstanceOf(ErroBcb);
  });
});
