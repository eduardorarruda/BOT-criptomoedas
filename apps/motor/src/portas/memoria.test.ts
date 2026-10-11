import { dec } from "@zentrade/dominio";
import type { NovaDecisao, RoboConfig } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { RelogioManual } from "../relogio.js";
import { AprovacaoMemoria, DecisoesMemoria, EventosMemoria, OrdensMemoria, RobosMemoria } from "./memoria.js";

const robo = { id: "r1" } as RoboConfig;

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
});
