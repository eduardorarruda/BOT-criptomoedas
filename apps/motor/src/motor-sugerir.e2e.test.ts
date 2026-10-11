import type { PortaAgente } from "@zentrade/contratos";
import { dec, posicaoDe, precoAlvo } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { AgenteFixo } from "./portas/agente-fixo.js";
import type { DecisoesMemoria } from "./portas/memoria.js";
import { montarCenario } from "./teste/cenario.js";

const ALVO = precoAlvo(dec(94), 0.01, 0.001);
const acimaDoAlvo = (mais = 0.1) => ALVO.plus(mais).toFixed(2);

/** "Dormir" que só volta quando o teste mandar: a aprovação fica pendente de verdade. */
function dormirControlado() {
  let soltar: (() => void)[] = [];
  return {
    dormir: () => new Promise<void>((r) => (soltar = [...soltar, r])),
    soltarTodos: () => {
      const s = soltar;
      soltar = [];
      s.forEach((r) => r());
    },
  };
}

/** Aprova só a primeira decisão (a compra); as seguintes ficam esperando a pessoa. */
const aprovaPrimeira = () => {
  let primeira = true;
  return (id: string, d: DecisoesMemoria) => {
    if (primeira) void d.mudarEstado(id, "aprovada");
    primeira = false;
  };
};

/** Conta as chamadas ao agente. */
class Contador implements PortaAgente {
  chamadas = 0;
  constructor(public atual: PortaAgente) {}
  analisar(p: Parameters<PortaAgente["analisar"]>[0]) {
    this.chamadas++;
    return this.atual.analisar(p);
  }
}

describe("modo sugerir: a espera pela pessoa não segura o robô", () => {
  it("registra a decisão aguardando aprovação com o prazo e publica o evento", async () => {
    const r = dormirControlado();
    const c = montarCenario({ modo: "sugerir", dormir: r.dormir });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94, true, false);
    const [d] = c.decisoes.todas();
    expect(d?.estado).toBe("aguardando_aprovacao");
    expect(d?.expiraEm).toBe(c.aprovacao.solicitacoes()[0]?.expiraEm);
    expect(d?.expiraEm).toBe(c.relogio.agora() + 5 * 60_000);
    expect(c.eventos.doTipo("decisao")[0]?.decisao.estado).toBe("aguardando_aprovacao");
    const parando = c.aoVivo.parar();
    r.soltarTodos();
    await parando;
  });

  it("com uma venda esperando aprovação, o stop da posição aberta continua vigiado", async () => {
    const r = dormirControlado();
    const c = montarCenario({ modo: "sugerir", dormir: r.dormir, aoSolicitar: aprovaPrimeira() });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94, true, false);
    r.soltarTodos();
    await c.aoVivo.ocioso();
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA"]);

    await c.fecharMinuto(acimaDoAlvo(), false); // venda pelo alvo: pede aprovação e espera
    expect(c.decisoes.todas()[1]?.estado).toBe("aguardando_aprovacao");
    await c.fecharMinuto(92, false); // o stop não espera ninguém
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    const [, vendaAlvo, vendaStop] = c.decisoes.todas();
    expect(vendaStop?.estado).toBe("executada");
    expect(vendaAlvo?.estado).toBe("barrada");
    expect(c.eventos.doTipo("risco").map((e) => e.barreira.codigo)).toContain("posicao_zerada");
    expect(c.aprovacao.solicitacoes()).toHaveLength(2); // a venda por stop não pediu aprovação
    r.soltarTodos();
    await c.aoVivo.ocioso();
    expect(c.ordensEnviadas()).toHaveLength(2);
  });

  it("venda aprovada depois que a posição já fechou: barrada, nada é enviado", async () => {
    const r = dormirControlado();
    const c = montarCenario({ modo: "sugerir", dormir: r.dormir, aoSolicitar: aprovaPrimeira() });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94, true, false);
    r.soltarTodos();
    await c.aoVivo.ocioso();
    await c.fecharMinuto(acimaDoAlvo(), false);
    const vendaId = c.decisoes.todas()[1]!.id;
    // A posição some por fora (ex.: venda manual na corretora registrada pelo banco).
    const execucoes = c.ordens.execucoes.bind(c.ordens);
    c.ordens.execucoes = async (id) => [
      ...(await execucoes(id)),
      ...(await execucoes(id)).map((e) => ({ ...e, lado: "VENDA" as const, em: e.em + 1 })),
    ];
    await c.decisoes.mudarEstado(vendaId, "aprovada");
    r.soltarTodos();
    await c.aoVivo.ocioso();
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas()[1]?.estado).toBe("barrada");
  });

  it("decisão pendente não repete o pedido a cada candle", async () => {
    const r = dormirControlado();
    const c = montarCenario({ modo: "sugerir", dormir: r.dormir });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94, true, false);
    await c.fecharIntervalo(93, true, false);
    await c.fecharIntervalo(92, true, false);
    expect(c.decisoes.todas()).toHaveLength(1);
    expect(c.aprovacao.solicitacoes()).toHaveLength(1);
    const parando = c.aoVivo.parar();
    r.soltarTodos();
    await parando;
  });

  it("parar o robô com aprovação pendente: a decisão expira (ninguém vai executá-la)", async () => {
    const r = dormirControlado();
    const c = montarCenario({ modo: "sugerir", dormir: r.dormir });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94, true, false);
    const parando = c.aoVivo.parar();
    r.soltarTodos();
    await parando;
    expect(c.decisoes.todas()[0]?.estado).toBe("expirada");
    expect(c.ordensEnviadas()).toHaveLength(0);
  });

  it("banco fora do ar durante a espera: tenta de novo até a resposta chegar", async () => {
    const c = montarCenario({ modo: "sugerir" });
    const estado = c.decisoes.estado.bind(c.decisoes);
    let falhas = 2;
    c.decisoes.estado = async (id) => {
      if (falhas-- > 0) throw new Error("banco fora");
      await c.decisoes.mudarEstado(id, "aprovada");
      return estado(id);
    };
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.ordensEnviadas()).toHaveLength(1);
    expect(c.decisoes.todas()[0]?.estado).toBe("executada");
  });

  it("stop no modo sugerir vende sem pedir aprovação (a pessoa aprovou a compra com o stop)", async () => {
    const c = montarCenario({ modo: "sugerir", aoSolicitar: (id, d) => void d.mudarEstado(id, "aprovada") });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    await c.fecharMinuto(92);
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(c.aprovacao.solicitacoes()).toHaveLength(1);
    expect(c.decisoes.todas()[1]?.estado).toBe("executada");
  });
});

describe("decisão bloqueada não se repete a cada minuto", () => {
  it("parada total ligada com o preço no stop: registra uma vez e espera a mudança", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.fecharMinuto(92);
    await c.fecharMinuto("91.9");
    await c.fecharMinuto("91.8");
    expect(c.decisoes.todas().filter((d) => d.estado === "barrada")).toHaveLength(1);
    c.robos.retomar();
    await c.fecharMinuto("91.7");
    expect(c.ordensEnviadas().map((o) => o.ordem.lado)).toEqual(["COMPRA", "VENDA"]);
    expect(posicaoDe(await c.ordens.execucoes("r1")).quantidade.isZero()).toBe(true);
  });

  it("agente dizendo aguardar numa venda pelo alvo: pergunta uma vez por candle do intervalo", async () => {
    const conta = new Contador(new AgenteFixo("sempre_concorda"));
    const c = montarCenario({ agente: conta });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    conta.atual = new AgenteFixo("nunca_concorda");
    const antes = conta.chamadas;
    await c.fecharMinuto(acimaDoAlvo());
    await c.fecharMinuto(acimaDoAlvo(0.2));
    await c.fecharMinuto(acimaDoAlvo(0.3));
    expect(conta.chamadas - antes).toBe(1);
    expect(c.decisoes.todas().filter((d) => d.estado === "registrada")).toHaveLength(1);
    await c.fecharIntervalo(acimaDoAlvo(0.4)); // candle novo do intervalo: pode perguntar de novo
    expect(conta.chamadas - antes).toBe(2);
    await c.fecharMinuto(acimaDoAlvo(0.5));
    expect(conta.chamadas - antes).toBe(2);
  });

  it("mudou a posição: o bloqueio anterior não vale mais", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    c.robos.pausar();
    await c.fecharMinuto(92);
    const execucoes = c.ordens.execucoes.bind(c.ordens);
    c.ordens.execucoes = async (id) =>
      (await execucoes(id)).map((e) => ({ ...e, quantidade: e.quantidade.times(2) }));
    await c.fecharMinuto("91.9");
    expect(c.decisoes.todas().filter((d) => d.estado === "barrada")).toHaveLength(2);
  });
});
