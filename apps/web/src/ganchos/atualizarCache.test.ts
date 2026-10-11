import type { DecisaoDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import {
  aplicarAnalise,
  aplicarDecisao,
  aplicarOrdem,
  aplicarRobo,
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
