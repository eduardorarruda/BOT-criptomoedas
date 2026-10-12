import type { PedidoAnalise, PortaAgente, RespostaAnalise } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { AgenteHttp } from "./portas/agente-http.js";
import { montarCenario } from "./teste/cenario.js";

const SEM_ORCAMENTO = "orçamento de IA do mês atingido (US$ 10,00 de US$ 10,00)";

/** Agente sem orçamento: "aguardar" com o motivo e a marca semOrcamento. */
const agenteSemOrcamento: PortaAgente = {
  analisar: async (_p: PedidoAnalise): Promise<RespostaAnalise> => ({
    proposta: {
      acao: "aguardar",
      confianca: 0,
      tamanhoRelativo: 0,
      justificativa: SEM_ORCAMENTO,
      riscos: [],
      fontes: [],
    },
    custoUsd: dec(0),
    semOrcamento: true,
  }),
};

describe("orçamento de IA esgotado no motor", () => {
  it("agente obrigatório: a compra é barrada com o motivo; o stop segue", async () => {
    const c = montarCenario({ agenteObrigatorio: true });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    c.agente.trocar(agenteSemOrcamento);
    await c.fecharMinuto(92); // stop: não pergunta ao agente
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    await c.fecharIntervalo(94);
    const barrada = c.decisoes.todas().at(-1);
    expect(barrada?.estado).toBe("barrada");
    expect(barrada?.risco.barreiras[0]?.codigo).toBe("agente_indisponivel");
    expect(barrada?.risco.barreiras[0]?.mensagem).toContain(SEM_ORCAMENTO);
    expect(c.ordensEnviadas()).toHaveLength(2);
  });

  it("agente opcional: segue sem ele, como com o agente fora do ar", async () => {
    const c = montarCenario({ agenteObrigatorio: false, agente: agenteSemOrcamento });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);
    expect(c.decisoes.todas().at(-1)?.proposta).toBeUndefined();
  });

  it("o cliente HTTP lê a marca semOrcamento do agente", async () => {
    const proposta = {
      acao: "aguardar",
      confianca: 0,
      tamanhoRelativo: 0,
      justificativa: SEM_ORCAMENTO,
      riscos: [],
      fontes: [],
    };
    const fetch = async () => Response.json({ proposta, custoUsd: "0", semOrcamento: true });
    const agente = new AgenteHttp({ url: "http://agente", segredo: "s".repeat(32), fetch });
    const r = await agente.analisar({
      robo: { id: "r1", simbolo: "BTCUSDT", intervalo: "1h" },
      sinal: { acao: "AGUARDAR", explicacao: "x" },
      preco: dec(1),
      fechamentos: [],
      posicao: { quantidade: dec(0), precoMedio: dec(0), resultadoRealizado: dec(0), taxasPagas: dec(0) },
    });
    expect(r.semOrcamento).toBe(true);
    const normal = new AgenteHttp({
      url: "http://agente",
      segredo: "s".repeat(32),
      fetch: async () => Response.json({ proposta, custoUsd: "0.01" }),
    });
    expect(
      (
        await normal.analisar({
          robo: { id: "r1", simbolo: "BTCUSDT", intervalo: "1h" },
          sinal: { acao: "AGUARDAR", explicacao: "x" },
          preco: dec(1),
          fechamentos: [],
          posicao: { quantidade: dec(0), precoMedio: dec(0), resultadoRealizado: dec(0), taxasPagas: dec(0) },
        })
      ).semOrcamento,
    ).toBeUndefined();
  });
});
