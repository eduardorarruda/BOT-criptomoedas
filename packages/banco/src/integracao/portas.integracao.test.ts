import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";

describe("portas do motor contra o PostgreSQL", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  const novaDecisao = (roboId: string, estado: "registrada" | "aguardando_aprovacao" = "registrada") =>
    c.banco.portas.decisoes.registrar({
      roboId,
      em: Date.now(),
      sinal: {
        acao: "COMPRAR",
        stop: dec("98"),
        alvo: dec("102"),
        explicacao: "SMA(9) cruzou acima de SMA(21)",
      },
      preco: dec("100"),
      quantidade: dec("0.5"),
      risco: { aprovada: true, barreiras: [] },
      estado,
      custoIaUsd: dec("0.0123"),
    });

  it("registra a decisão, muda o estado e lê de volta", async () => {
    const id = await novaDecisao(c.ana.robo.id);
    expect(await c.banco.portas.decisoes.estado(id)).toBe("registrada");
    await c.banco.portas.decisoes.mudarEstado(id, "executada");
    expect(await c.banco.portas.decisoes.estado(id)).toBe("executada");
    expect(await c.banco.portas.decisoes.estado("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("reservar é idempotente: o mesmo id_cliente nunca vira duas ordens", async () => {
    const decisaoId = await novaDecisao(c.ana.robo.id);
    const ordem = {
      decisaoId,
      roboId: c.ana.robo.id,
      idCliente: "zt-idem-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA" as const,
      quantidade: dec("0.5"),
    };
    const [a, b] = await Promise.all([
      c.banco.portas.ordens.reservar(ordem),
      c.banco.portas.ordens.reservar(ordem),
    ]);
    expect([a, b].sort()).toEqual(["ja_existe", "nova"]);
    expect(await c.banco.portas.ordens.reservar(ordem)).toBe("ja_existe");
    expect(await c.banco.portas.ordens.contarDesde(c.ana.robo.id, Date.now() - 60_000)).toBe(1);
  });

  it("deriva a posição das execuções confirmadas (sem tabela de posição)", async () => {
    const roboId = c.beto.robo.id;
    const executar = async (
      idCliente: string,
      lado: "COMPRA" | "VENDA",
      preco: string,
      q: string,
      taxa: string,
      em: number,
    ) => {
      const decisaoId = await novaDecisao(roboId);
      await c.banco.portas.ordens.reservar({
        decisaoId,
        roboId,
        idCliente,
        simbolo: "BTCUSDT",
        lado,
        quantidade: dec(q),
      });
      const execucao = { lado, preco: dec(preco), quantidade: dec(q), taxaCotacao: dec(taxa), em };
      const resultado = {
        idCliente,
        idCorretora: `b-${idCliente}`,
        estado: "PREENCHIDA" as const,
        execucoes: [execucao],
      };
      await c.banco.portas.ordens.concluir(idCliente, resultado);
      await c.banco.portas.ordens.concluir(idCliente, resultado); // reconcluir não duplica
    };
    const t0 = Date.now() - 10_000;
    await executar("zt-pos-1", "COMPRA", "100", "1", "0.1", t0);
    await executar("zt-pos-2", "COMPRA", "200", "1", "0.2", t0 + 1000);
    await executar("zt-pos-3", "VENDA", "120", "1.5", "0.18", t0 + 2000);

    const posicao = await c.banco.robos.posicao(c.beto.id, roboId);
    expect(posicao).toEqual({
      roboId,
      simbolo: "BTCUSDT",
      quantidade: "0.5",
      precoMedio: "150",
      resultadoRealizado: "-45.48",
      taxasPagas: "0.48",
    });
    expect((await c.banco.portas.ordens.execucoes(roboId)).length).toBe(3);
    expect((await c.banco.portas.ordens.resultadoDesde(roboId, t0 + 2000)).toFixed()).toBe("-45.18");
    expect(await c.banco.portas.ordens.ultimaPerdaEm(roboId)).toBe(t0 + 2000);
  });

  it("concluir uma ordem que não foi reservada é erro, não silêncio", async () => {
    await expect(
      c.banco.portas.ordens.concluir("zt-nao-existe", {
        idCliente: "zt-nao-existe",
        idCorretora: null,
        estado: "REJEITADA",
        execucoes: [],
      }),
    ).rejects.toThrow(/não foi reservada/);
  });

  it("lista os robôs ativos com estratégia e limites em decimais exatos", async () => {
    const ativos = await c.banco.portas.robos.ativos();
    const robo = ativos.find((r) => r.id === c.ana.robo.id)!;
    expect(robo.limites.perdaDiariaMaxima.equals(50)).toBe(true);
    expect(robo.limites.pausaAposPerdaMs).toBe(30 * 60_000);
    expect(robo.riscoPorOperacao.equals(10)).toBe(true);
    expect(robo.estrategia.stop).toBe(0.02);
    expect(robo.modo).toBe("observar");
  });

  it("pausado considera o robô e a parada total da dona", async () => {
    expect(await c.banco.portas.robos.pausado(c.ana.robo.id)).toBe(false);
    expect(await c.banco.configuracao.paradaTotal(c.ana.id)).toBe(false);
    await c.banco.configuracao.definirParadaTotal(c.ana.id, true);
    expect(await c.banco.configuracao.paradaTotal(c.ana.id)).toBe(true);
    expect(await c.banco.portas.robos.pausado(c.ana.robo.id)).toBe(true);
    expect(await c.banco.portas.robos.pausado(c.beto.robo.id)).toBe(false);
    await c.banco.configuracao.definirParadaTotal(c.ana.id, false);
    await c.banco.robos.atualizar(c.beto.id, c.beto.robo.id, { pausado: true });
    expect(await c.banco.portas.robos.pausado(c.beto.robo.id)).toBe(true);
    expect((await c.banco.portas.robos.ativos()).map((r) => r.id)).not.toContain(c.beto.robo.id);
    // robô que não existe conta como pausado: na dúvida, não operar
    expect(await c.banco.portas.robos.pausado("00000000-0000-0000-0000-000000000000")).toBe(true);
    await c.banco.robos.atualizar(c.beto.id, c.beto.robo.id, { pausado: false });
  });

  it("decisão aguardando aprovação expira sozinha", async () => {
    const id = await novaDecisao(c.ana.robo.id, "aguardando_aprovacao");
    await c.banco.conexao.sql`update decisoes set expira_em = now() - interval '1 second' where id = ${id}`;
    expect(await c.banco.portas.decisoes.estado(id)).toBe("expirada");
  });
});
