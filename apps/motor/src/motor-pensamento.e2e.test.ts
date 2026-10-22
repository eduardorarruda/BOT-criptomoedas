import type { PedidoAnalise, PortaAgente, PortaPensamentos } from "@zentrade/contratos";
import { dec, type PensamentoRobo } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { montarCenario } from "./teste/cenario.js";

class PensamentosGravados implements PortaPensamentos {
  readonly lista: { roboId: string; pensamento: PensamentoRobo }[] = [];
  registrar(roboId: string, pensamento: PensamentoRobo): Promise<void> {
    this.lista.push({ roboId, pensamento });
    return Promise.resolve();
  }
}

const agenteQueContaConsultas = () => {
  const pedidos: PedidoAnalise[] = [];
  const agente: PortaAgente = {
    analisar: async (p) => {
      pedidos.push(p);
      return {
        proposta: {
          acao: "comprar",
          confianca: 0.9,
          tamanhoRelativo: 1,
          justificativa: "ok",
          riscos: [],
          fontes: [],
        },
        custoUsd: dec("0.01"),
      };
    },
  };
  return { agente, pedidos };
};

describe("motor: o pensamento do robô a cada vela", () => {
  it("grava o pensamento mesmo sem sinal: a regra deu não, o robô diz por quê", async () => {
    const guardados = new PensamentosGravados();
    const c = montarCenario({ pensamentos: guardados });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(100);
    expect(c.decisoes.todas()).toHaveLength(0);
    const [{ pensamento }] = guardados.lista as [(typeof guardados.lista)[number]];
    expect(guardados.lista).toHaveLength(1);
    expect(pensamento.sinal).toBe("AGUARDAR");
    expect(pensamento.regraAvaliada).toBe("entrada");
    expect(pensamento.condicoes?.valor).toBe(false);
    expect(pensamento.conclusao).toBe("Fico de fora: não é verdade que preço (100) < 95.");
    expect(pensamento.agente).toBe("decide");
    expect(pensamento.cenario.cenario).toBe("indefinido");
  });

  it("publica o evento ao vivo com o mesmo pensamento", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(100);
    const eventos = c.eventos.doTipo("pensamento");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.roboId).toBe("r1");
    expect(eventos[0]?.pensamento.conclusao).toContain("Fico de fora");
  });

  it("com sinal, a decisão leva o cenário e as condições do momento", async () => {
    const c = montarCenario({ pensamentos: new PensamentosGravados() });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const [compra] = c.decisoes.todas();
    expect(compra?.sinal.acao).toBe("COMPRAR");
    expect(compra?.regime?.cenario).toBe("indefinido");
    expect(compra?.condicoes).toMatchObject({ tipo: "condicao", valor: true, texto: "preço (94) < 95" });
    const publicada = c.eventos.doTipo("decisao")[0]?.decisao;
    expect(publicada?.condicoes?.valor).toBe(true);
  });

  it("com histórico longo o cenário é lido e vai com o pensamento", async () => {
    const guardados = new PensamentosGravados();
    const c = montarCenario({ pensamentos: guardados, candlesHistorico: 300, tamanhoHistorico: 500 });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(100);
    const { cenario } = guardados.lista[0]?.pensamento ?? {};
    expect(cenario?.cenario).toBe("lateral");
    expect(cenario?.texto).toContain("média de 200 velas");
  });

  it("Claude desligado: o pensamento diz isso e nenhuma consulta de IA é feita", async () => {
    const { agente, pedidos } = agenteQueContaConsultas();
    const guardados = new PensamentosGravados();
    const c = montarCenario({ agente, limites: { agente: "desligado" }, pensamentos: guardados });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(pedidos).toHaveLength(0);
    expect(guardados.lista[0]?.pensamento.agente).toBe("desligado");
    expect(guardados.lista[0]?.pensamento.conclusao).toContain(
      "Claude desligado: só a regra e o risco decidem.",
    );
  });

  it("Claude decidindo: o pensamento só anuncia a conferência, sem gastar IA por causa dele", async () => {
    const { agente, pedidos } = agenteQueContaConsultas();
    const c = montarCenario({ agente, pensamentos: new PensamentosGravados() });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(100);
    expect(pedidos).toHaveLength(0);
  });

  it("falha ao guardar o pensamento não derruba a vela: a decisão segue e o erro vai para o registro", async () => {
    const quebrada: PortaPensamentos = { registrar: () => Promise.reject(new Error("banco fora")) };
    const c = montarCenario({ pensamentos: quebrada });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.decisoes.todas()).toHaveLength(1);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.erros.map((e) => e.msg)).toContain("falha ao guardar o pensamento do robô");
    expect(c.erros.map((e) => e.msg)).not.toContain("falha ao decidir no candle do intervalo");
  });

  it("posicionado: o pensamento mantém a posição e mostra a regra de saída", async () => {
    const guardados = new PensamentosGravados();
    const c = montarCenario({ pensamentos: guardados });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharIntervalo(94.2);
    const ultimo = guardados.lista.at(-1)?.pensamento;
    expect(ultimo?.posicionado).toBe(true);
    expect(ultimo?.conclusao).toMatch(/^Mantenho a posição: /);
  });
});
