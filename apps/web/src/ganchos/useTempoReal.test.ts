import type { DecisaoDTO, OrdemDTO } from "@zentrade/contratos/esquemas";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { chaves } from "./chaves";
import { lojaAnalises, lojaBarreiras, lojaPrecos } from "./lojas";
import { aplicarEvento } from "./useTempoReal";

const decisao = (estado: DecisaoDTO["estado"]): DecisaoDTO => ({
  id: "d1",
  roboId: "r1",
  em: 1,
  sinal: { acao: "COMPRAR", explicacao: "x" },
  preco: "1",
  risco: { aprovada: true, barreiras: [] },
  estado,
});

describe("aplicarEvento", () => {
  it("guarda o preço novo junto com o anterior", () => {
    const qc = new QueryClient();
    aplicarEvento(qc, { tipo: "preco", simbolo: "BTCUSDT", preco: "10", em: 1 });
    aplicarEvento(qc, { tipo: "preco", simbolo: "BTCUSDT", preco: "11", em: 2 });
    expect(lojaPrecos.obter().BTCUSDT).toEqual({ preco: "11", anterior: "10", em: 2 });
  });

  it("move a decisão entre as listas filtradas", () => {
    const qc = new QueryClient();
    qc.setQueryData(chaves.decisoes({ estado: "aguardando_aprovacao" }), [decisao("aguardando_aprovacao")]);
    qc.setQueryData(chaves.decisoes({}), [decisao("aguardando_aprovacao")]);
    aplicarEvento(qc, { tipo: "decisao", decisao: decisao("aprovada") });
    expect(qc.getQueryData(chaves.decisoes({ estado: "aguardando_aprovacao" }))).toEqual([]);
    expect(qc.getQueryData<DecisaoDTO[]>(chaves.decisoes({}))?.[0]?.estado).toBe("aprovada");
  });

  it("inclui ordens, robôs e barreiras", () => {
    const qc = new QueryClient();
    qc.setQueryData(chaves.ordens(), []);
    qc.setQueryData(chaves.robos, [{ id: "r1", nome: "a" }]);
    aplicarEvento(qc, { tipo: "ordem", ordem: { id: "o1" } as OrdemDTO });
    aplicarEvento(qc, { tipo: "robo", robo: { id: "r1", nome: "b" } as never });
    aplicarEvento(qc, {
      tipo: "risco",
      roboId: "r1",
      barreira: { codigo: "exposicao", mensagem: "m" },
      em: 5,
    });
    aplicarEvento(qc, { tipo: "saude", servico: "motor", ok: true, em: 1 });
    expect(qc.getQueryData<OrdemDTO[]>(chaves.ordens())).toHaveLength(1);
    expect(qc.getQueryData<{ nome: string }[]>(chaves.robos)?.[0]?.nome).toBe("b");
    expect(lojaBarreiras.obter()[0]).toMatchObject({ codigo: "exposicao", roboId: "r1" });
  });

  it("mostra a análise ao vivo e a retira um pouco depois de concluída", () => {
    const qc = new QueryClient();
    const agendar = vi.fn();
    aplicarEvento(
      qc,
      {
        tipo: "analise",
        analiseId: "a1",
        roboId: "r1",
        concluida: false,
        etapa: { ferramenta: "f", descricao: "d", em: 1 },
      },
      agendar as never,
    );
    expect(lojaAnalises.obter().a1?.etapas).toHaveLength(1);
    aplicarEvento(
      qc,
      { tipo: "analise", analiseId: "a1", roboId: "r1", concluida: true, decisaoId: "d1" },
      agendar as never,
    );
    expect(agendar).toHaveBeenCalledTimes(1);
    (agendar.mock.calls[0]![0] as () => void)();
    expect(lojaAnalises.obter().a1).toBeUndefined();
  });
});
