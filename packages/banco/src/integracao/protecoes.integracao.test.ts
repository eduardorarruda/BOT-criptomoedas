import type { NovaDecisao, ResultadoOrdem } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIMITES, montarCenario, type Cenario } from "./ajuda.js";

describe("proteção: robô pausado com posição aberta segue vigiado", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  const novoRobo = (usuarioId: string, estrategiaId: string) =>
    c.banco.robos.criar(usuarioId, {
      nome: "Com posição",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      modo: "auto",
      rede: "testnet",
      estrategiaId,
      estrategiaVersao: 1,
      limites: LIMITES,
    });

  const compra = (roboId: string): NovaDecisao => ({
    roboId,
    em: Date.now(),
    sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "entrada" },
    preco: dec("100"),
    quantidade: dec("0.5"),
    risco: { aprovada: true, barreiras: [] },
    estado: "executada",
  });

  const executada = (idCliente: string, lado: "COMPRA" | "VENDA", quantidade: string): ResultadoOrdem => ({
    idCliente,
    idCorretora: `b-${idCliente}`,
    estado: "PREENCHIDA",
    execucoes: [
      { lado, preco: dec(100), quantidade: dec(quantidade), taxaCotacao: dec("0.01"), em: Date.now() },
    ],
  });

  async function operar(roboId: string, idCliente: string, lado: "COMPRA" | "VENDA", quantidade: string) {
    const decisaoId = await c.banco.portas.decisoes.registrar(compra(roboId));
    const pedido = { decisaoId, roboId, idCliente, simbolo: "BTCUSDT", lado, quantidade: dec(quantidade) };
    await c.banco.portas.ordens.reservar(pedido);
    await c.banco.portas.ordens.concluir(idCliente, executada(idCliente, lado, quantidade));
  }

  const ativos = async () => (await c.banco.portas.robos.ativos()).map((r) => r.id);

  it("pausado sem posição sai da lista; pausado com posição aberta continua (o stop segue vigiado)", async () => {
    const semPosicao = await novoRobo(c.ana.id, c.ana.estrategia.id);
    const comPosicao = await novoRobo(c.ana.id, c.ana.estrategia.id);
    await operar(comPosicao.id, "zt-ativos-1", "COMPRA", "0.5");
    await c.banco.robos.atualizar(c.ana.id, semPosicao.id, { pausado: true });
    await c.banco.robos.atualizar(c.ana.id, comPosicao.id, { pausado: true });
    expect(await ativos()).not.toContain(semPosicao.id);
    expect(await ativos()).toContain(comPosicao.id);

    await operar(comPosicao.id, "zt-ativos-2", "VENDA", "0.5");
    expect(await ativos()).not.toContain(comPosicao.id);
  });

  it("a parada total não tira ninguém da lista: quem decide é o risco, a cada decisão", async () => {
    await c.banco.configuracao.definirParadaTotal(c.beto.id, true);
    expect(await ativos()).toContain(c.beto.robo.id);
    expect(await c.banco.portas.robos.pausado(c.beto.robo.id)).toBe(true);
    await c.banco.configuracao.definirParadaTotal(c.beto.id, false);
  });
});
