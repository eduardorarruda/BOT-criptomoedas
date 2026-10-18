import type { PedidoAnalise, PortaAgente } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { pedidoNoFio } from "./portas/agente-http.js";
import { montarCenario } from "./teste/cenario.js";

const agenteQueGuarda = (pedidos: PedidoAnalise[]): PortaAgente => ({
  analisar: async (pedido) => {
    pedidos.push(pedido);
    return {
      proposta: {
        acao: "aguardar",
        confianca: 0,
        tamanhoRelativo: 0,
        justificativa: "só guardando o pedido",
        riscos: [],
        fontes: [],
      },
      custoUsd: dec(0),
    };
  },
});

describe("motor: o pedido ao agente leva como a operação sai, quanto custa e as velas", () => {
  it("compra: operação (taxa da estratégia, deslizamento, stop, alvo) e velas alinhadas aos fechamentos", async () => {
    const pedidos: PedidoAnalise[] = [];
    const c = montarCenario({ agente: agenteQueGuarda(pedidos) });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const [pedido] = pedidos;
    expect(pedido?.sinal.acao).toBe("COMPRAR");
    expect(pedido?.operacao).toMatchObject({
      sentido: "comprado",
      custos: { mercado: "cripto", taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 },
      alvoLiquido: 0.01,
    });
    expect(pedido?.velas?.maximas).toHaveLength(pedido?.fechamentos.length ?? -1);
    expect(pedido?.velas?.instantes.at(-1)).toBeGreaterThan(pedido?.velas?.instantes[0] ?? Infinity);
  });

  it("no fio, operação e velas vão como estão (números), prontos para o apps/agente validar", async () => {
    const pedidos: PedidoAnalise[] = [];
    const c = montarCenario({ agente: agenteQueGuarda(pedidos) });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const fio = pedidoNoFio(pedidos[0]!);
    expect(fio.operacao?.custos.mercado).toBe("cripto");
    expect(fio.velas?.volumes.length).toBe(fio.fechamentos.length);
  });
});
