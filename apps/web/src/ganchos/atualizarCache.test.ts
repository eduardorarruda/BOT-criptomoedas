import type { DecisaoDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import {
  aplicarAnalise,
  aplicarDecisao,
  aplicarOrdem,
  aplicarPensamento,
  aplicarRobo,
  entraNoHistorico,
  removerAnalise,
  substituirOuIncluir,
} from "./atualizarCache";

const decisao = (id: string, estado: DecisaoDTO["estado"], roboId = "r1"): DecisaoDTO => ({
  id,
  roboId,
  em: 1,
  sinal: { acao: "COMPRAR", explicacao: "x" },
  preco: "1",
  risco: { aprovada: true, barreiras: [] },
  estado,
});

describe("atualização dos dados ao vivo", () => {
  it("inclui no início ou troca no lugar", () => {
    const lista = [{ id: "a", v: 1 }];
    expect(substituirOuIncluir(lista, { id: "b", v: 2 })).toEqual([
      { id: "b", v: 2 },
      { id: "a", v: 1 },
    ]);
    expect(substituirOuIncluir(lista, { id: "a", v: 3 })).toEqual([{ id: "a", v: 3 }]);
    expect(substituirOuIncluir(lista, { id: "c", v: 0 }, false).at(-1)?.id).toBe("c");
  });

  it("tira a decisão da lista filtrada quando o estado muda", () => {
    const lista = [decisao("d1", "aguardando_aprovacao")];
    expect(aplicarDecisao(lista, decisao("d1", "aprovada"), { estado: "aguardando_aprovacao" })).toEqual([]);
    expect(aplicarDecisao(lista, decisao("d1", "aprovada"))[0]?.estado).toBe("aprovada");
  });

  it("respeita robô e limite do filtro", () => {
    const lista = [decisao("d1", "registrada")];
    expect(aplicarDecisao(lista, decisao("d2", "registrada", "r2"), { roboId: "r1" })).toEqual(lista);
    expect(aplicarDecisao(lista, decisao("d2", "registrada"), { limite: 1 }).map((d) => d.id)).toEqual([
      "d2",
    ]);
  });

  it("atualiza ordens e robôs", () => {
    expect(aplicarOrdem([], { id: "o" } as never)).toHaveLength(1);
    expect(aplicarRobo([{ id: "r" } as never], { id: "r2" } as never).map((r) => r.id)).toEqual(["r", "r2"]);
  });

  it("acumula as etapas da análise e marca a conclusão", () => {
    let a = aplicarAnalise(
      {},
      {
        tipo: "analise",
        analiseId: "x",
        roboId: "r",
        concluida: false,
        etapa: { ferramenta: "f1", descricao: "d", em: 1 },
      },
    );
    a = aplicarAnalise(a, {
      tipo: "analise",
      analiseId: "x",
      roboId: "r",
      concluida: false,
      etapa: { ferramenta: "f2", descricao: "d", em: 2 },
    });
    a = aplicarAnalise(a, { tipo: "analise", analiseId: "x", roboId: "r", concluida: true, decisaoId: "d9" });
    expect(a.x?.etapas.map((e) => e.ferramenta)).toEqual(["f1", "f2"]);
    expect(a.x?.concluida).toBe(true);
    expect(a.x?.decisaoId).toBe("d9");
    expect(removerAnalise(a, "x")).toEqual({});
    expect(removerAnalise(a, "nada")).toBe(a);
  });

  it("guarda só as análises mais recentes", () => {
    let a = {};
    for (let i = 0; i < 9; i++)
      a = aplicarAnalise(a, { tipo: "analise", analiseId: `a${i}`, roboId: "r", concluida: false });
    expect(Object.keys(a)).toEqual(["a3", "a4", "a5", "a6", "a7", "a8"]);
  });
});

describe("pensamento do robô ao vivo", () => {
  const leitura = (cenario: "alta" | "lateral", sinal: "AGUARDAR" | "COMPRAR" = "AGUARDAR") =>
    ({
      em: 1,
      preco: "1",
      sinal,
      posicionado: false,
      regraAvaliada: "entrada",
      condicoes: null,
      cenario: {
        cenario,
        precoVsSma200: null,
        precoVsSma400: null,
        inclinacaoSma200: null,
        limiarInclinacao: null,
        variacao7d: null,
        janelaVariacaoHoras: null,
        atrPct: null,
        atrPercentil: null,
        eficiencia: null,
        texto: "x",
      },
      agente: "decide",
      explicacao: "x",
      conclusao: "x",
    }) as const;

  it("troca o pensamento do robô que já pensou, sem mexer nos outros", () => {
    const lista = [
      { roboId: "r1", simbolo: "BTCUSDT", intervalo: "1h", pensamento: leitura("lateral") },
      { roboId: "r2", simbolo: "ETHUSDT", intervalo: "1h", pensamento: leitura("lateral") },
    ] as const;
    const nova = aplicarPensamento(lista, "r1", leitura("alta"), undefined);
    expect(nova?.[0]?.pensamento.cenario.cenario).toBe("alta");
    expect(nova?.[1]).toBe(lista[1]);
  });

  it("robô que ainda não pensou entra se a tela conhece o ativo; senão pede para recarregar", () => {
    const robo = { simbolo: "SOLUSDT", intervalo: "4h" } as const;
    expect(aplicarPensamento([], "r9", leitura("alta"), robo)).toEqual([
      { roboId: "r9", simbolo: "SOLUSDT", intervalo: "4h", pensamento: leitura("alta") },
    ]);
    expect(aplicarPensamento([], "r9", leitura("alta"), undefined)).toBeNull();
  });

  it("entra no histórico na primeira leitura, na mudança de cenário e no sinal; o resto, não", () => {
    expect(entraNoHistorico(undefined, leitura("lateral"))).toBe(true);
    expect(entraNoHistorico(leitura("lateral"), leitura("alta"))).toBe(true);
    expect(entraNoHistorico(leitura("alta"), leitura("alta", "COMPRAR"))).toBe(true);
    expect(entraNoHistorico(leitura("alta"), leitura("alta"))).toBe(false);
  });
});
