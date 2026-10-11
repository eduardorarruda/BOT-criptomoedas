import type { DecisaoDTO, Evento } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { criarRetransmissorN8n } from "./retransmissor.js";

const decisao = (estado: DecisaoDTO["estado"], acao: "COMPRAR" | "AGUARDAR" = "COMPRAR"): Evento => ({
  tipo: "decisao",
  decisao: {
    id: "d1",
    roboId: "r1",
    em: 1,
    sinal: { acao, explicacao: "x" },
    preco: "1",
    risco: { aprovada: true, barreiras: [] },
    estado,
  },
});

const dados = {
  decisaoId: "d1",
  roboId: "r1",
  simbolo: "BTCUSDT",
  acao: "COMPRAR" as const,
  quantidade: "0.1",
  preco: "1",
  explicacao: "y".repeat(2000),
  expiraEm: 99,
};

function montar(paraProposta: () => Promise<typeof dados | null> = vi.fn(async () => dados)) {
  const n8n = { enviarProposta: vi.fn(async () => undefined), enviarAlerta: vi.fn(async () => undefined) };
  const log = { warn: vi.fn(), error: vi.fn() };
  return { n8n, log, retransmitir: criarRetransmissorN8n({ decisoes: { paraProposta }, n8n, log }) };
}

describe("propostas para aprovação humana no n8n", () => {
  it("envia uma vez cada decisão aguardando aprovação, com resumo curto", async () => {
    const { n8n, retransmitir } = montar();
    await retransmitir(decisao("aguardando_aprovacao"));
    await retransmitir(decisao("aguardando_aprovacao"));
    expect(n8n.enviarProposta).toHaveBeenCalledOnce();
    const enviada = (n8n.enviarProposta.mock.calls[0] as unknown[])[0] as {
      resumo: string;
      expiraEm: number;
    };
    expect(enviada.resumo.length).toBe(1000);
    expect(enviada.expiraEm).toBe(99);
  });

  it("ignora outros eventos e decisões que não pedem aprovação", async () => {
    const { n8n, retransmitir } = montar();
    await retransmitir(decisao("registrada"));
    await retransmitir(decisao("aguardando_aprovacao", "AGUARDAR"));
    await retransmitir({ tipo: "preco", simbolo: "BTCUSDT", preco: "1", em: 1 });
    expect(n8n.enviarProposta).not.toHaveBeenCalled();
  });

  it("falha no n8n fica no log e não derruba nada; decisão sumida também", async () => {
    const { n8n, log, retransmitir } = montar();
    n8n.enviarProposta.mockRejectedValueOnce(new Error("n8n fora"));
    await expect(retransmitir(decisao("aguardando_aprovacao"))).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
    const sumida = montar(vi.fn(async () => null));
    await sumida.retransmitir(decisao("aguardando_aprovacao"));
    expect(sumida.log.warn).toHaveBeenCalled();
  });
});
