import type { PedidoAnalise, PortaAgente, RespostaAnalise } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { montarCenario } from "./teste/cenario.js";

/** Agente que conta as consultas; `vetar` faz ele propor aguardar, com custo. */
function agenteContador(vetar: boolean) {
  const pedidos: PedidoAnalise[] = [];
  const agente: PortaAgente = {
    analisar: async (p: PedidoAnalise): Promise<RespostaAnalise> => {
      pedidos.push(p);
      return {
        proposta: {
          acao: vetar ? "aguardar" : "comprar",
          confianca: 0.9,
          tamanhoRelativo: 1,
          justificativa: "teste",
          riscos: [],
          fontes: [],
        },
        custoUsd: dec("0.01"),
      };
    },
  };
  return { agente, pedidos };
}

describe("Claude ligado ou desligado por robô (limites.agente)", () => {
  it("desligado: não consulta o agente, não registra custo e opera pela regra, dizendo na decisão", async () => {
    const { agente, pedidos } = agenteContador(true);
    const c = montarCenario({ agente, limites: { agente: "desligado" } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(pedidos).toHaveLength(0);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    const d = c.decisoes.todas()[0];
    expect(d?.custoIaUsd).toBeUndefined();
    expect(d?.proposta).toBeUndefined();
    expect(d?.sinal.explicacao).toContain("Claude desligado para este robô");
  });

  it("decide (padrão): consulta o agente e respeita o veto, sem a linha de desligado", async () => {
    const { agente, pedidos } = agenteContador(true);
    const c = montarCenario({ agente, limites: { agente: "decide" } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(pedidos).toHaveLength(1);
    expect(c.ordensEnviadas()).toHaveLength(0);
    const d = c.decisoes.todas()[0];
    expect(d?.risco.barreiras[0]?.codigo).toBe("agente_aguardar");
    expect(d?.sinal.explicacao).not.toContain("desligado");
  });

  it("sem o campo: igual a decide", async () => {
    const { agente, pedidos } = agenteContador(false);
    const c = montarCenario({ agente });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(pedidos).toHaveLength(1);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas()[0]?.custoIaUsd).toBeDefined();
  });

  it("desligado com agente obrigatório e fora do ar: não barra por agente indisponível", async () => {
    const c = montarCenario({ agente: "falha", agenteObrigatorio: true, limites: { agente: "desligado" } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    expect(c.decisoes.todas()[0]?.estado).not.toBe("barrada");
  });

  it("desligado: a confiança do plano é 1, então a confiança mínima não barra", async () => {
    const c = montarCenario({ limites: { agente: "desligado", confiancaMinima: 0.99 } });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(1);
  });
});
