import { describe, expect, it, vi } from "vitest";
import { criarCliente } from "../../api/cliente";
import { patrimonioDemo } from "./demo";
import { criarFontePatrimonio, criarFontePatrimonioDemo } from "./fonte";

const AGORA = 1_790_000_000_000;
const resposta = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

describe("fonte do patrimônio", () => {
  it("pede o consolidado à API e confere a resposta com o contrato", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      resposta(patrimonioDemo(AGORA)),
    );
    const fonte = criarFontePatrimonio(criarCliente({ base: "/api/v1", fetch }));
    expect((await fonte.patrimonio()).moeda).toBe("BRL");
    expect(String(fetch.mock.calls[0]![0])).toBe("/api/v1/patrimonio/consolidado");
  });

  it("resposta fora do contrato vira erro, não número errado na tela", async () => {
    const fetch = vi.fn(async () => resposta({ ...patrimonioDemo(AGORA), total: 10 }));
    const fonte = criarFontePatrimonio(criarCliente({ base: "/api/v1", fetch }));
    await expect(fonte.patrimonio()).rejects.toBeInstanceOf(Error);
  });

  it("demonstração responde sem rede", async () => {
    expect((await criarFontePatrimonioDemo().patrimonio()).classes).toHaveLength(3);
  });
});
