import type { NovaDecisao, NovaProtecao, ResultadoOrdem } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { comoUsuario } from "../cliente.js";
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

  it("pausado com ordem incerta (PENDENTE) também segue na lista: a partida confere na corretora", async () => {
    const robo = await novoRobo(c.ana.id, c.ana.estrategia.id);
    const decisaoId = await c.banco.portas.decisoes.registrar(compra(robo.id));
    await c.banco.portas.ordens.reservar({
      decisaoId,
      roboId: robo.id,
      idCliente: "zt-ativos-pendente",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("0.5"),
    });
    await c.banco.robos.atualizar(c.ana.id, robo.id, { pausado: true });
    expect(await ativos()).toContain(robo.id);
    await c.banco.portas.ordens.concluir("zt-ativos-pendente", {
      idCliente: "zt-ativos-pendente",
      idCorretora: null,
      estado: "REJEITADA",
      execucoes: [],
    });
    expect(await ativos()).not.toContain(robo.id);
  });

  it("a parada total não tira ninguém da lista: quem decide é o risco, a cada decisão", async () => {
    await c.banco.configuracao.definirParadaTotal(c.beto.id, true);
    expect(await ativos()).toContain(c.beto.robo.id);
    expect(await c.banco.portas.robos.pausado(c.beto.robo.id)).toBe(true);
    await c.banco.configuracao.definirParadaTotal(c.beto.id, false);
  });
});

describe("PortaProtecoes: a proteção na corretora, durável", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  const portas = () => c.banco.portas;

  async function compraExecutada(roboId: string, quantidade = "0.5") {
    const decisaoId = await portas().decisoes.registrar({
      roboId,
      em: Date.now(),
      sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "entrada" },
      preco: dec("100"),
      quantidade: dec(quantidade),
      risco: { aprovada: true, barreiras: [] },
      estado: "executada",
    });
    const idCliente = `zt-c-${decisaoId.slice(0, 8)}`;
    await portas().ordens.reservar({
      decisaoId,
      roboId,
      idCliente,
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec(quantidade),
    });
    await portas().ordens.concluir(idCliente, {
      idCliente,
      idCorretora: "b-1",
      estado: "PREENCHIDA",
      execucoes: [
        {
          lado: "COMPRA",
          preco: dec(100),
          quantidade: dec(quantidade),
          taxaCotacao: dec("0.05"),
          em: Date.now(),
        },
      ],
    });
    return decisaoId;
  }

  const nova = (roboId: string, decisaoId: string, lista: string): NovaProtecao => ({
    roboId,
    decisaoId,
    simbolo: "BTCUSDT",
    ids: { lista, stop: `${lista}-s`, alvo: `${lista}-a` },
    quantidade: dec("0.5"),
    stop: dec("98"),
    limite: dec("97.02"),
    alvo: dec("102.5"),
  });

  it("reserva antes de enviar; uma viva por robô; o mesmo id não entra duas vezes", async () => {
    const roboId = c.ana.robo.id;
    const decisaoId = await compraExecutada(roboId);
    expect(await portas().protecoes.reservar(nova(roboId, decisaoId, "zt-p1"))).toBe("nova");
    const viva = await portas().protecoes.viva(roboId);
    expect(viva).toMatchObject({ estado: "PENDENTE", decisaoId, idCorretora: null, simbolo: "BTCUSDT" });
    expect(viva?.ids).toEqual({ lista: "zt-p1", stop: "zt-p1-s", alvo: "zt-p1-a" });
    expect(viva?.limite.toFixed()).toBe("97.02");
    expect(viva?.alvo?.toFixed()).toBe("102.5");
    expect(await portas().protecoes.reservar(nova(roboId, decisaoId, "zt-p2"))).toBe("ja_existe");

    await portas().protecoes.atualizar("zt-p1", "ATIVA", { idCorretora: "77" });
    expect((await portas().protecoes.viva(roboId))?.idCorretora).toBe("77");
    await portas().protecoes.atualizar("zt-p1", "CANCELADA");
    expect(await portas().protecoes.viva(roboId)).toBeNull();
    expect((await portas().protecoes.ultima(roboId))?.estado).toBe("CANCELADA");
    expect((await portas().protecoes.ultima(roboId))?.idCorretora).toBe("77");
    expect(await portas().protecoes.reservar(nova(roboId, decisaoId, "zt-p1"))).toBe("ja_existe");
    expect(await portas().protecoes.reservar(nova(roboId, decisaoId, "zt-p2"))).toBe("nova");
    await portas().protecoes.atualizar("zt-p2", "REJEITADA", { motivo: "Order would trigger immediately." });
    expect((await portas().protecoes.ultima(roboId))?.motivo).toMatch(/trigger/);
  });

  it("robô ou proteção que não existe é erro, não silêncio", async () => {
    const fantasma = "00000000-0000-0000-0000-000000000000";
    await expect(portas().protecoes.reservar(nova(fantasma, fantasma, "zt-fantasma"))).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
    await expect(portas().protecoes.atualizar("zt-nao-existe", "ATIVA")).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
  });

  it("registrarSaida grava a venda (decisão, ordem e execuções) uma vez só e fecha a posição", async () => {
    const roboId = c.beto.robo.id;
    const decisaoId = await compraExecutada(roboId);
    await portas().protecoes.reservar(nova(roboId, decisaoId, "zt-s1"));
    await portas().protecoes.atualizar("zt-s1", "ATIVA", { idCorretora: "88" });
    const venda = (quantidade: string, estado: ResultadoOrdem["estado"], execucoes: string[]) => ({
      decisao: {
        roboId,
        em: Date.now(),
        sinal: {
          acao: "VENDER" as const,
          motivo: "stop" as const,
          explicacao: "stop executado na corretora",
        },
        preco: dec("98"),
        quantidade: dec(quantidade),
        risco: { aprovada: true, barreiras: [] },
        estado: "executada" as const,
      },
      quantidade: dec("0.5"),
      ordem: {
        idCliente: "zt-s1-s",
        idCorretora: "881",
        estado,
        execucoes: execucoes.map((q, i) => ({
          lado: "VENDA" as const,
          preco: dec("97.9"),
          quantidade: dec(q),
          taxaCotacao: dec("0.01"),
          em: Date.now() + i,
        })),
      },
    });
    const parcial = await portas().protecoes.registrarSaida("zt-s1", venda("0.2", "PARCIAL", ["0.2"]));
    expect(parcial.nova).toBe(true);
    const total = await portas().protecoes.registrarSaida(
      "zt-s1",
      venda("0.5", "PREENCHIDA", ["0.2", "0.3"]),
    );
    expect(total).toEqual({ decisaoId: parcial.decisaoId, nova: false });
    await portas().protecoes.registrarSaida("zt-s1", venda("0.5", "PREENCHIDA", ["0.2", "0.3"]));
    await portas().protecoes.atualizar("zt-s1", "EXECUTADA");

    const vendas = (await portas().ordens.execucoes(roboId)).filter((e) => e.lado === "VENDA");
    expect(vendas.map((e) => e.quantidade.toFixed())).toEqual(["0.2", "0.3"]);
    expect(await portas().decisoes.estado(parcial.decisaoId)).toBe("executada");
    const posicao = await c.banco.robos.posicao(c.beto.id, roboId);
    expect(posicao?.quantidade).toBe("0");
    expect(posicao?.protecaoCorretora).toMatchObject({ estado: "EXECUTADA", stop: "98", limite: "97.02" });
    const ordens = await c.banco.ordens.listar(c.beto.id, { roboId });
    expect(ordens.some((o) => o.idCliente === "zt-s1-s" && o.estado === "PREENCHIDA")).toBe(true);
  });

  it("a tela vê a proteção viva na posição; outra pessoa não vê nada (RLS)", async () => {
    const roboId = c.ana.robo.id;
    const ultima = await portas().protecoes.ultima(roboId);
    const posicao = await c.banco.robos.posicao(c.ana.id, roboId);
    expect(posicao?.protecaoCorretora?.estado).toBe(ultima?.estado);
    expect(posicao?.protecaoCorretora?.motivo).toMatch(/trigger/);
    const daAna = await comoUsuario(c.banco.conexao.db, c.beto.id, (tx) =>
      tx.execute(sql`select id from protecoes_corretora where robo_id = ${roboId}`),
    );
    expect(daAna).toHaveLength(0);
    await expect(
      comoUsuario(c.banco.conexao.db, c.ana.id, (tx) =>
        tx.execute(sql`update protecoes_corretora set estado = 'CANCELADA' where robo_id = ${roboId}`),
      ),
    ).rejects.toThrow();
  });
});
