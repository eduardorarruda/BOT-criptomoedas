import { dec } from "@zentrade/dominio";
import type { NovaDecisao, RoboConfig } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { RelogioManual } from "../relogio.js";
import { AprovacaoMemoria, DecisoesMemoria, EventosMemoria, OrdensMemoria, RobosMemoria } from "./memoria.js";

const robo = { id: "r1", usuarioId: "u1" } as RoboConfig;

const decisao: NovaDecisao = {
  roboId: "r1",
  em: 1,
  sinal: { acao: "AGUARDAR", explicacao: "nada" },
  preco: dec(100),
  risco: { aprovada: true, barreiras: [] },
  estado: "registrada",
};

describe("portas em memória", () => {
  it("robôs: ativos e parada total global ou por robô, lida na hora", async () => {
    const robos = new RobosMemoria([robo]);
    expect(await robos.ativos()).toEqual([robo]);
    expect(await robos.pausado("r1")).toBe(false);
    robos.pausar("r1");
    expect(await robos.pausado("r1")).toBe(true);
    expect(await robos.pausado("r2")).toBe(false);
    robos.retomar("r1");
    robos.pausar();
    expect(await robos.pausado("r2")).toBe(true);
    robos.retomar();
    expect(await robos.pausado("r2")).toBe(false);
  });

  it("decisões: registra, muda estado e consulta", async () => {
    const d = new DecisoesMemoria();
    const id = await d.registrar(decisao);
    expect(await d.estado(id)).toBe("registrada");
    await d.mudarEstado(id, "aprovada");
    expect(await d.estado(id)).toBe("aprovada");
    expect(await d.estado("nada")).toBeNull();
    expect(d.todas()).toHaveLength(1);
    expect(d.todas()[0]).toMatchObject({ id, estado: "aprovada" });
    await expect(d.mudarEstado("nada", "aprovada")).rejects.toThrow(/não existe/);
  });

  it("ordens: reserva idempotente, conclusão e contas do risco", async () => {
    const relogio = new RelogioManual(1_000);
    const o = new OrdensMemoria(relogio);
    const nova = {
      decisaoId: "d",
      roboId: "r1",
      idCliente: "zt-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA" as const,
      quantidade: dec(1),
    };
    expect(await o.reservar(nova)).toBe("nova");
    expect(await o.reservar(nova)).toBe("ja_existe");
    await o.concluir("zt-1", {
      idCliente: "zt-1",
      idCorretora: "1",
      estado: "PREENCHIDA",
      execucoes: [
        { lado: "COMPRA", preco: dec(100), quantidade: dec(1), taxaCotacao: dec("0.1"), em: 1_000 },
      ],
    });
    relogio.definir(2_000);
    await o.reservar({ ...nova, idCliente: "zt-2", lado: "VENDA" });
    await o.concluir("zt-2", {
      idCliente: "zt-2",
      idCorretora: "2",
      estado: "PREENCHIDA",
      execucoes: [{ lado: "VENDA", preco: dec(90), quantidade: dec(1), taxaCotacao: dec("0.09"), em: 2_000 }],
    });
    expect((await o.execucoes("r1")).map((e) => e.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(await o.execucoes("outro")).toEqual([]);
    expect(await o.contarDesde("r1", 1_500)).toBe(1);
    expect((await o.resultadoDesde("r1", 0)).equals(dec("-10.19"))).toBe(true);
    expect(await o.ultimaPerdaEm("r1")).toBe(2_000);
    expect(o.todas().map((x) => x.resultado?.estado)).toEqual(["PREENCHIDA", "PREENCHIDA"]);
    await expect(
      o.concluir("nunca-reservada", {
        idCliente: "x",
        idCorretora: null,
        estado: "REJEITADA",
        execucoes: [],
      }),
    ).rejects.toThrow(/reservada/);
  });

  it("eventos e aprovações ficam guardados para quem testa", async () => {
    const e = new EventosMemoria();
    await e.publicar({ tipo: "saude", servico: "motor", ok: true, em: 1 });
    expect(e.todos()).toHaveLength(1);
    expect(e.doTipo("saude")).toHaveLength(1);
    const pedidos: string[] = [];
    const a = new AprovacaoMemoria((id) => pedidos.push(id));
    await a.solicitar("d1", "comprar", 10);
    expect(a.solicitacoes()).toEqual([{ decisaoId: "d1", resumo: "comprar", expiraEm: 10 }]);
    expect(pedidos).toEqual(["d1"]);
    await new AprovacaoMemoria().solicitar("d2", "x", 1);
  });

  it("decisões: desfecho gravado e a última compra executada com a proteção", async () => {
    const d = new DecisoesMemoria();
    expect(await d.ultimaCompraExecutada("r1")).toBeNull();
    const compra: NovaDecisao = {
      ...decisao,
      sinal: { acao: "COMPRAR", stop: dec(98), alvo: dec(102), explicacao: "entrada" },
      protecao: { stop: dec("98.5"), alvo: dec(101) },
    };
    const a = await d.registrar({ ...compra, em: 1 });
    const b = await d.registrar({ ...compra, em: 2 });
    await d.registrar({ ...compra, em: 3 }); // não executada
    await d.registrar({ ...compra, roboId: "r2", em: 4, estado: "executada" });
    await d.registrar({
      ...decisao,
      em: 5,
      estado: "executada",
      sinal: { acao: "VENDER", motivo: "alvo", explicacao: "alvo" },
    });
    await d.mudarEstado(b, "executada");
    await d.mudarEstado(a, "executada");
    const ultima = await d.ultimaCompraExecutada("r1");
    expect(ultima?.decisaoId).toBe(b);
    expect(ultima?.preco.equals(dec(100))).toBe(true);
    expect(ultima?.protecao?.stop.equals(dec("98.5"))).toBe(true);
    const { protecao: _sem, ...semProtecaoDecisao } = compra;
    const semProtecao = await d.registrar({ ...semProtecaoDecisao, em: 9, estado: "executada" });
    expect(await d.ultimaCompraExecutada("r1")).toEqual({ decisaoId: semProtecao, preco: dec(100) });

    await d.registrarDesfecho(b, dec("-2.5"), 50);
    expect(d.todas().find((x) => x.id === b)?.desfecho).toEqual({ resultado: dec("-2.5"), em: 50 });
    await expect(d.registrarDesfecho("nada", dec(1), 1)).rejects.toThrow(/não existe/);
  });

  it("ordens: pendentes sobrevivem para a reconciliação; reconcluir não duplica execução", async () => {
    const relogio = new RelogioManual(1_000);
    const o = new OrdensMemoria(relogio);
    const nova = (idCliente: string, roboId = "r1") => ({
      decisaoId: `d-${idCliente}`,
      roboId,
      idCliente,
      simbolo: "BTCUSDT",
      lado: "COMPRA" as const,
      quantidade: dec(1),
    });
    await o.reservar(nova("a"));
    relogio.avancar(1);
    await o.reservar(nova("b"));
    await o.reservar(nova("c", "r2"));
    await o.concluir("b", { idCliente: "b", idCorretora: null, estado: "PENDENTE", execucoes: [] });
    expect(await o.pendentes("r1")).toEqual([
      { idCliente: "a", decisaoId: "d-a", lado: "COMPRA", quantidade: dec(1), criadaEm: 1_000 },
      { idCliente: "b", decisaoId: "d-b", lado: "COMPRA", quantidade: dec(1), criadaEm: 1_001 },
    ]);
    const preenchida = {
      idCliente: "a",
      idCorretora: "1",
      estado: "PREENCHIDA" as const,
      execucoes: [
        { lado: "COMPRA" as const, preco: dec(100), quantidade: dec(1), taxaCotacao: dec(0), em: 5 },
      ],
    };
    await o.concluir("a", preenchida);
    await o.concluir("a", preenchida);
    expect(await o.execucoes("r1")).toHaveLength(1);
    expect((await o.pendentes("r1")).map((p) => p.idCliente)).toEqual(["b"]);
  });
});
