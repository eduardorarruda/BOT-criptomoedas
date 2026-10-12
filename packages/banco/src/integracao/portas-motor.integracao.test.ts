import type { NovaDecisao } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCenario, type Cenario } from "./ajuda.js";

describe("portas do motor: prazo, proteção, desfecho e pendentes", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  const compra = (roboId: string, extra: Partial<NovaDecisao> = {}): NovaDecisao => ({
    roboId,
    em: Date.now(),
    sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "entrada" },
    preco: dec("100"),
    quantidade: dec("0.5"),
    risco: { aprovada: true, barreiras: [] },
    estado: "registrada",
    ...extra,
  });

  it("o RoboConfig traz a dona do robô", async () => {
    const ativos = await c.banco.portas.robos.ativos();
    expect(ativos.find((r) => r.id === c.ana.robo.id)?.usuarioId).toBe(c.ana.id);
  });

  it("grava o prazo de aprovação que vier; sem ele, usa o padrão de 5 minutos", async () => {
    const em = Date.now();
    const comPrazo = await c.banco.portas.decisoes.registrar(
      compra(c.ana.robo.id, { em, estado: "aguardando_aprovacao", expiraEm: em + 60_000 }),
    );
    const semPrazo = await c.banco.portas.decisoes.registrar(
      compra(c.ana.robo.id, { em, estado: "aguardando_aprovacao" }),
    );
    expect((await c.banco.decisoes.paraProposta(comPrazo))?.expiraEm).toBe(em + 60_000);
    expect((await c.banco.decisoes.paraProposta(semPrazo))?.expiraEm).toBe(em + 5 * 60_000);
  });

  it("guarda a proteção efetiva e devolve a última compra executada", async () => {
    const roboId = c.beto.robo.id;
    expect(await c.banco.portas.decisoes.ultimaCompraExecutada(roboId)).toBeNull();
    const t = Date.now();
    const antiga = await c.banco.portas.decisoes.registrar(compra(roboId, { em: t - 2000 }));
    await c.banco.portas.decisoes.mudarEstado(antiga, "executada");
    const nova = await c.banco.portas.decisoes.registrar(
      compra(roboId, { em: t - 1000, protecao: { stop: dec("98.5"), alvo: dec("101.25") } }),
    );
    await c.banco.portas.decisoes.mudarEstado(nova, "executada");
    const naoExecutada = await c.banco.portas.decisoes.registrar(compra(roboId, { em: t }));
    expect(naoExecutada).not.toBe(nova);
    const venda = await c.banco.portas.decisoes.registrar({
      ...compra(roboId, { em: t + 1 }),
      sinal: { acao: "VENDER", motivo: "alvo", explicacao: "alvo" },
    });
    await c.banco.portas.decisoes.mudarEstado(venda, "executada");
    const ultima = await c.banco.portas.decisoes.ultimaCompraExecutada(roboId);
    expect(ultima?.decisaoId).toBe(nova);
    expect(ultima?.preco.toFixed()).toBe("100");
    expect(ultima?.protecao?.stop.toFixed()).toBe("98.5");
    expect(ultima?.protecao?.alvo.toFixed()).toBe("101.25");
    await c.banco.portas.decisoes.mudarEstado(antiga, "executada");
    expect((await c.banco.portas.decisoes.ultimaCompraExecutada(roboId))?.decisaoId).toBe(nova);
  });

  it("subirStop: o stop efetivo da compra só sobe (stop móvel e empate sobrevivem ao reinício)", async () => {
    const roboId = c.beto.robo.id;
    const id = await c.banco.portas.decisoes.registrar(
      compra(roboId, { em: Date.now() + 5_000, protecao: { stop: dec("98.5"), alvo: dec("101.25") } }),
    );
    await c.banco.portas.decisoes.mudarEstado(id, "executada");
    await c.banco.portas.decisoes.subirStop(id, dec("99.1"));
    await c.banco.portas.decisoes.subirStop(id, dec("98.9"));
    const ultima = await c.banco.portas.decisoes.ultimaCompraExecutada(roboId);
    expect(ultima?.decisaoId).toBe(id);
    expect(ultima?.protecao?.stop.toFixed()).toBe("99.1");
    expect(ultima?.protecao?.alvo.toFixed()).toBe("101.25");
    await expect(
      c.banco.portas.decisoes.subirStop("00000000-0000-0000-0000-000000000000", dec(1)),
    ).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("compra executada sem proteção gravada volta sem proteção", async () => {
    const roboId = c.ana.robo.id;
    const id = await c.banco.portas.decisoes.registrar(compra(roboId, { em: Date.now() + 10_000 }));
    await c.banco.portas.decisoes.mudarEstado(id, "executada");
    const ultima = await c.banco.portas.decisoes.ultimaCompraExecutada(roboId);
    expect(ultima?.decisaoId).toBe(id);
    expect(ultima?.protecao).toBeUndefined();
  });

  it("registra o desfecho na decisão (o diário que o agente consulta)", async () => {
    const id = await c.banco.portas.decisoes.registrar(compra(c.ana.robo.id));
    const em = Date.UTC(2026, 9, 10, 15, 0);
    await c.banco.portas.decisoes.registrarDesfecho(id, dec("-3.215"), em);
    const lida = await c.banco.decisoes.obter(c.ana.id, id);
    expect(lida?.desfecho).toEqual({ resultado: "-3.215", avaliadoEm: em });
    await expect(
      c.banco.portas.decisoes.registrarDesfecho("00000000-0000-0000-0000-000000000000", dec(1), em),
    ).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("pendentes: só as ordens PENDENTE do robô, e reconcluir não duplica execução", async () => {
    const roboId = c.ana.robo.id;
    const decisaoId = await c.banco.portas.decisoes.registrar(compra(roboId));
    const ordem = (idCliente: string) => ({
      decisaoId,
      roboId,
      idCliente,
      simbolo: "BTCUSDT",
      lado: "COMPRA" as const,
      quantidade: dec("0.25"),
    });
    await c.banco.portas.ordens.reservar(ordem("zt-pend-1"));
    await c.banco.portas.ordens.reservar(ordem("zt-pend-2"));
    await c.banco.portas.ordens.concluir("zt-pend-2", {
      idCliente: "zt-pend-2",
      idCorretora: null,
      estado: "PENDENTE",
      execucoes: [],
      motivo: "Estado incerto",
    });
    await c.banco.portas.ordens.reservar(ordem("zt-pend-3"));
    const preenchida = {
      idCliente: "zt-pend-3",
      idCorretora: "b-3",
      estado: "PREENCHIDA" as const,
      execucoes: [
        {
          lado: "COMPRA" as const,
          preco: dec(100),
          quantidade: dec("0.25"),
          taxaCotacao: dec("0.025"),
          em: 1,
        },
      ],
    };
    await c.banco.portas.ordens.concluir("zt-pend-3", preenchida);
    const pendentes = await c.banco.portas.ordens.pendentes(roboId);
    expect(pendentes.map((p) => p.idCliente)).toEqual(["zt-pend-1", "zt-pend-2"]);
    expect(pendentes[0]).toMatchObject({ decisaoId, lado: "COMPRA" });
    expect(pendentes[0]?.quantidade.toFixed()).toBe("0.25");
    expect(typeof pendentes[0]?.criadaEm).toBe("number");
    expect(await c.banco.portas.ordens.pendentes(c.beto.robo.id)).toEqual([]);

    await c.banco.portas.ordens.concluir("zt-pend-1", { ...preenchida, idCliente: "zt-pend-1" });
    await c.banco.portas.ordens.concluir("zt-pend-1", { ...preenchida, idCliente: "zt-pend-1" });
    expect((await c.banco.portas.ordens.pendentes(roboId)).map((p) => p.idCliente)).toEqual(["zt-pend-2"]);
    const doRobo = await c.banco.portas.ordens.execucoes(roboId);
    expect(doRobo.filter((e) => e.em === 1)).toHaveLength(2); // zt-pend-1 e zt-pend-3, uma cada
  });

  it("paraRodar: marca o backtest como rodando e traz a estratégia; concluído não roda de novo", async () => {
    const pedido = {
      estrategiaId: c.ana.estrategia.id,
      versao: 1,
      simbolo: "BTCUSDT",
      intervalo: "1h" as const,
      inicio: Date.UTC(2026, 0, 1),
      fim: Date.UTC(2026, 0, 2),
    };
    const { id } = await c.banco.backtests.criar(c.ana.id, pedido);
    const rodar = await c.banco.backtests.paraRodar(id);
    expect(rodar).toMatchObject({ id, simbolo: "BTCUSDT", intervalo: "1h", inicio: pedido.inicio });
    expect(rodar?.estrategia.stop).toBe(0.02);
    expect(rodar?.estrategia.entrada).toEqual(c.ana.estrategia.entrada);
    expect((await c.banco.backtests.obter(c.ana.id, id))?.estado).toBe("rodando");
    expect(await c.banco.backtests.paraRodar(id)).not.toBeNull(); // job repetido depois de queda
    await c.banco.backtests.concluir(id, { metricas: {}, curva: [] });
    expect(await c.banco.backtests.paraRodar(id)).toBeNull();
    expect(await c.banco.backtests.paraRodar("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("criarBancoDoMotor: só o que o motor usa, sem chave mestra", async () => {
    const { criarBancoDoMotor } = await import("../banco.js");
    const motor = criarBancoDoMotor({ url: c.url, maximoConexoes: 2 });
    try {
      expect((await motor.portas.robos.ativos()).length).toBeGreaterThan(0);
      await motor.mercado.gravar("BTCUSDT", "1m", []);
      expect(motor.backtests.paraRodar).toBeTypeOf("function");
    } finally {
      await motor.fechar();
    }
  });
});
