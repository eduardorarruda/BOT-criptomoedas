import { EventoEsquema, type Evento, type PedidoAnalise, type PortaAgente } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { montarCenario } from "./teste/cenario.js";

/** O que a tela "Ao vivo" vê: o tipo de cada evento, com o detalhe que importa. */
function roteiro(eventos: readonly Evento[]): string[] {
  return eventos.map((e) => {
    switch (e.tipo) {
      case "sinal":
        return `sinal:${e.acao}`;
      case "analise":
        return e.concluida ? `analise:fim:${e.resultado}` : "analise:inicio";
      case "decisao":
        return `decisao:${e.decisao.estado}`;
      case "ordem":
        return `ordem:${e.ordem.estado}`;
      case "risco":
        return `risco:${e.barreira.codigo}`;
      default:
        return e.tipo;
    }
  });
}

/** Agente que guarda os pedidos recebidos (para conferir o analiseId). */
class AgenteEspiao implements PortaAgente {
  readonly pedidos: PedidoAnalise[] = [];
  private readonly base = new AgenteFixo("sempre_concorda");
  analisar(p: PedidoAnalise) {
    this.pedidos.push(p);
    return this.base.analisar(p);
  }
}

describe("eventos ao vivo de um ciclo completo", () => {
  it("compra: candle → preço → sinal → análise → decisão → ordem enviada → executada → posição", async () => {
    const espiao = new AgenteEspiao();
    const c = montarCenario({ agente: espiao });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);

    expect(roteiro(c.eventos.todos())).toEqual([
      "candle",
      "preco",
      "sinal:COMPRAR",
      "analise:inicio",
      "analise:fim:comprar",
      "decisao:aprovada",
      "ordem:PENDENTE",
      "ordem:PREENCHIDA",
      "decisao:executada",
      "posicao",
    ]);
    for (const e of c.eventos.todos()) expect(EventoEsquema.safeParse(e).success).toBe(true);

    const [inicio, fim] = c.eventos.doTipo("analise");
    expect(inicio?.analiseId).toBe(fim?.analiseId);
    expect(espiao.pedidos[0]?.analiseId).toBe(inicio?.analiseId);

    const [candle] = c.eventos.doTipo("candle");
    expect(candle).toMatchObject({ roboId: "r1", simbolo: "BTCUSDT", intervalo: "15m" });
    expect(candle?.candle.fecha).toBe("94");
    expect(c.eventos.doTipo("sinal")[0]?.explicacao).toMatch(/preço/);

    const enviada = c.eventos.doTipo("ordem")[0]?.ordem;
    expect(enviada?.execucoes).toEqual([]);
    const posicao = c.eventos.doTipo("posicao")[0];
    expect(dec(posicao?.quantidade ?? "0").gt(0)).toBe(true);
    expect(posicao?.precoMedio).toBe("94");
    expect(dec(posicao?.taxasPagas ?? "0").gt(0)).toBe(true);
  });

  it("candle sem sinal: publica só o candle, o preço e o sinal AGUARDAR com o porquê", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(100);
    expect(roteiro(c.eventos.todos())).toEqual(["candle", "preco", "sinal:AGUARDAR"]);
    expect(c.eventos.doTipo("sinal")[0]?.explicacao.length).toBeGreaterThan(0);
  });

  it("stop no candle de 1 min: sinal de venda sem análise, ordem e posição zerada com o resultado", async () => {
    const c = montarCenario();
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const antes = c.eventos.todos().length;
    await c.fecharMinuto(93); // longe do stop: só o preço
    await c.fecharMinuto(92);
    const depois = roteiro(c.eventos.todos().slice(antes));
    expect(depois).toEqual([
      "preco",
      "preco",
      "sinal:VENDER",
      "decisao:aprovada",
      "ordem:PENDENTE",
      "ordem:PREENCHIDA",
      "decisao:executada",
      "posicao",
    ]);
    const posicao = c.eventos.doTipo("posicao").at(-1);
    expect(posicao?.quantidade).toBe("0");
    expect(dec(posicao?.resultadoRealizado ?? "0").lt(0)).toBe(true);
  });

  it("agente fora do ar: a análise fecha como falhou e a barreira aparece", async () => {
    const c = montarCenario({ agente: "falha" });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(roteiro(c.eventos.todos())).toEqual([
      "candle",
      "preco",
      "sinal:COMPRAR",
      "analise:inicio",
      "analise:fim:falhou",
      "decisao:barrada",
      "risco:agente_indisponivel",
    ]);
  });

  it("agente discorda: a análise fecha com aguardar e nada é enviado", async () => {
    const c = montarCenario({ agente: "nunca_concorda" });
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    const r = roteiro(c.eventos.todos());
    expect(r).toContain("analise:fim:aguardar");
    expect(r.some((x) => x.startsWith("ordem"))).toBe(false);
  });

  it("publicar falhando não derruba o robô: a decisão segue e a falha vai para o registro", async () => {
    const c = montarCenario();
    c.deps.eventos.publicar = () => Promise.reject(new Error("Redis fora"));
    await c.aoVivo.iniciar();
    await c.fecharIntervalo(94);
    expect(c.decisoes.todas()[0]?.estado).toBe("executada");
    expect(c.erros.some((e) => e.msg === "falha ao publicar evento")).toBe(true);
  });
});
