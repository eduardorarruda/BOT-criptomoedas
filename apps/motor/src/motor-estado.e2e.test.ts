import type { PedidoAnalise, PortaAgente } from "@zentrade/contratos";
import { dec, posicaoDe, precoAlvo, precoStop } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { montarCenario, USUARIO } from "./teste/cenario.js";

/** Agente que concorda e propõe um stop mais alto (93,5) que o da regra (92,12). */
const agenteComStop = (pedidos: PedidoAnalise[] = []): PortaAgente => ({
  analisar: async (pedido) => {
    pedidos.push(pedido);
    return {
      proposta: {
        acao: pedido.sinal.acao === "COMPRAR" ? "comprar" : "vender",
        confianca: 0.9,
        tamanhoRelativo: 1,
        stop: "93.5",
        justificativa: "ok",
        riscos: [],
        fontes: [],
      },
      custoUsd: dec("0.01"),
    };
  },
});

describe("motor: estado durável (desfecho, proteção, reinício)", () => {
  it("a compra guarda o stop e o alvo efetivos (o mais conservador entre regra e agente)", async () => {
    const c = montarCenario({ agente: agenteComStop() });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const [compra] = c.decisoes.todas();
    expect(compra?.protecao?.stop.equals(dec("93.5"))).toBe(true);
    expect(compra?.protecao?.alvo.equals(precoAlvo(dec(94), 0.01, 0.001))).toBe(true);
  });

  it("venda que fecha a posição grava o desfecho (líquido das duas taxas) na compra que a abriu", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharMinuto(precoAlvo(dec(94), 0.01, 0.001).plus(0.1).toFixed(2));
    const posicao = posicaoDe(await c.ordens.execucoes("r1"));
    expect(posicao.quantidade.isZero()).toBe(true);
    const [compra, venda] = c.decisoes.todas();
    expect(compra?.desfecho?.resultado.equals(posicao.resultadoRealizado)).toBe(true);
    expect(compra?.desfecho?.resultado.gt(0)).toBe(true);
    expect(compra?.desfecho?.em).toBe(c.relogio.agora());
    expect(venda?.desfecho).toBeUndefined();
  });

  it("o desfecho de cada ida e volta vai para a sua compra (perda no stop)", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharMinuto(92);
    await c.fecharIntervalo(94);
    await c.fecharMinuto(precoAlvo(dec(94), 0.01, 0.001).plus(1).toFixed(2));
    const compras = c.decisoes.todas().filter((d) => d.sinal.acao === "COMPRAR");
    expect(compras).toHaveLength(2);
    expect(compras[0]?.desfecho?.resultado.lt(0)).toBe(true);
    expect(compras[1]?.desfecho?.resultado.gt(0)).toBe(true);
  });

  it("reinício: a posição aberta segue com o stop do agente (lido do diário)", async () => {
    const c = montarCenario({ agente: agenteComStop() });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.reiniciar();
    await c.fecharMinuto("93.4"); // acima do stop da regra (92,12), abaixo do stop do agente
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas()[0]?.desfecho?.resultado.lt(0)).toBe(true);
  });

  it("reinício: compra sem proteção gravada volta ao stop da estratégia", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.reiniciar();
    await c.fecharMinuto("93.4");
    expect(c.ordensEnviadas()).toHaveLength(1);
    await c.fecharMinuto(precoStop(dec(94), 0.02).minus(0.01).toFixed(2));
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
  });

  it("reinício com ordem pendente: confere na corretora antes de decidir (sem compra em dobro)", async () => {
    const c = montarCenario();
    const original = c.papel.enviarOrdemMercado.bind(c.papel);
    let falhar = true;
    c.papel.enviarOrdemMercado = async (p) => {
      const r = await original(p); // a ordem entra na corretora...
      if (falhar) throw new Error("tempo esgotado"); // ...mas a resposta se perde
      return r;
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()[0]?.resultado?.estado).toBe("PENDENTE");
    falhar = false;
    await c.reiniciar(); // a memória do robô some; a ordem pendente está nas portas
    await c.fecharIntervalo(93);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.ordensEnviadas()[0]?.resultado?.estado).toBe("PREENCHIDA");
    expect(c.decisoes.todas()[0]?.estado).toBe("executada");
    expect(await c.ordens.pendentes("r1")).toEqual([]);
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas()[0]?.desfecho).toBeDefined();
  });

  it("venda incerta reconciliada depois: o desfecho também é gravado", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const original = c.papel.enviarOrdemMercado.bind(c.papel);
    c.papel.enviarOrdemMercado = async (p) => {
      await original(p);
      throw new Error("tempo esgotado");
    };
    await c.fecharMinuto(92);
    expect(c.decisoes.todas()[0]?.desfecho).toBeUndefined();
    c.papel.enviarOrdemMercado = original;
    await c.fecharIntervalo(96);
    expect(posicaoDe(await c.ordens.execucoes("r1")).quantidade.isZero()).toBe(true);
    expect(c.decisoes.todas()[0]?.desfecho?.resultado.lt(0)).toBe(true);
  });

  it("o pedido ao agente leva a dona do robô e o orçamento de risco", async () => {
    const pedidos: PedidoAnalise[] = [];
    const c = montarCenario({ agente: agenteComStop(pedidos) });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const [pedido] = pedidos;
    expect(pedido?.usuarioId).toBe(USUARIO);
    expect(pedido?.orcamento?.riscoPorOperacao.equals(dec(10))).toBe(true);
    expect(pedido?.orcamento?.exposicaoMaxima.equals(dec(1000))).toBe(true);
    expect(pedido?.orcamento?.perdaDiariaMaxima.equals(dec(50))).toBe(true);
    expect(pedido?.orcamento?.exposicaoAtual.isZero()).toBe(true);
    expect(pedido?.orcamento?.resultadoDoDia.isZero()).toBe(true);
  });

  it("orçamento indisponível não impede a análise: vai sem ele e fica no registro", async () => {
    const pedidos: PedidoAnalise[] = [];
    const c = montarCenario({ agente: agenteComStop(pedidos) });
    await c.aoVivo.iniciar();
    const resultadoDesde = c.ordens.resultadoDesde.bind(c.ordens);
    let chamadas = 0;
    c.ordens.resultadoDesde = (roboId, desde) =>
      ++chamadas === 1 ? Promise.reject(new Error("banco lento")) : resultadoDesde(roboId, desde);
    await c.fecharIntervalo(94);
    expect(pedidos[0]?.orcamento).toBeUndefined();
    expect(c.ordensEnviadas()).toHaveLength(1);
  });

  it("posição aberta sem compra no diário: vende no stop e não inventa desfecho", async () => {
    const c = montarCenario({ agente: new AgenteFixo("sempre_concorda") });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.decisoes.ultimaCompraExecutada = () => Promise.resolve(null);
    await c.reiniciar();
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.decisoes.todas()[0]?.desfecho).toBeUndefined();
  });
});
