import type { DecisaoDTO, OrdemDTO } from "@zentrade/contratos/esquemas";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { chaves } from "./chaves";
import { lojaAnalises, lojaAoVivo, lojaBarreiras, lojaPrecos, lojaUltimoEvento } from "./lojas";
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

const ordem = (id: string, decisaoId: string): OrdemDTO => ({
  id,
  decisaoId,
  idCliente: `zt-${id}`,
  simbolo: "BTCUSDT",
  lado: "COMPRA",
  quantidade: "1",
  estado: "PREENCHIDA",
  criadaEm: 1,
  execucoes: [],
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
    aplicarEvento(qc, { tipo: "ordem", ordem: ordem("o1", "d-sem-dono") });
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

  it("alerta novo faz a tela de Risco reler avisos e pausas, sem entrar no histórico do robô", () => {
    const qc = new QueryClient();
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    const antes = lojaAoVivo.obter().length;
    aplicarEvento(qc, {
      tipo: "alerta",
      alerta: {
        tipo: "stop_atingido",
        gravidade: "atencao",
        titulo: "Stop atingido",
        mensagem: "m",
        chave: "stop:d1",
        roboId: "r1",
        em: 1,
      },
    });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: chaves.risco });
    expect(lojaAoVivo.obter()).toHaveLength(antes);
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

  it("ordem entra na lista do robô dela e não na de outro; sem saber o robô, a lista recarrega", () => {
    const qc = new QueryClient();
    qc.setQueryData(chaves.decisoes({}), [decisao("executada")]);
    qc.setQueryData(chaves.ordens("r1"), []);
    qc.setQueryData(chaves.ordens("r2"), []);
    aplicarEvento(qc, { tipo: "ordem", ordem: ordem("o1", "d1") });
    expect(qc.getQueryData<OrdemDTO[]>(chaves.ordens("r1"))).toHaveLength(1);
    expect(qc.getQueryData<OrdemDTO[]>(chaves.ordens("r2"))).toHaveLength(0);
    aplicarEvento(qc, { tipo: "ordem", ordem: ordem("o2", "d-desconhecida") });
    expect(qc.getQueryState(chaves.ordens("r2"))?.isInvalidated).toBe(true);
  });

  it("posição ao vivo vai direto para o cache do robô; tudo de robô entra no histórico ao vivo", () => {
    const qc = new QueryClient();
    const depois = Date.now() + 60_000;
    aplicarEvento(
      qc,
      {
        tipo: "posicao",
        roboId: "r9",
        simbolo: "BTCUSDT",
        quantidade: "0.5",
        precoMedio: "100",
        resultadoRealizado: "-1",
        taxasPagas: "0.1",
        em: 7,
      },
      setTimeout,
      () => depois,
    );
    expect(qc.getQueryData(chaves.posicao("r9"))).toEqual({
      roboId: "r9",
      simbolo: "BTCUSDT",
      quantidade: "0.5",
      precoMedio: "100",
      resultadoRealizado: "-1",
      taxasPagas: "0.1",
    });
    aplicarEvento(
      qc,
      { tipo: "sinal", roboId: "r9", acao: "AGUARDAR", explicacao: "x", preco: "1", em: 8 },
      setTimeout,
      () => depois + 1,
    );
    const ultimos = lojaAoVivo.obter().slice(-2);
    expect(ultimos.map((r) => r.evento.tipo)).toEqual(["posicao", "sinal"]);
    expect(ultimos[0]?.recebidoEm).toBe(depois);
    expect(lojaUltimoEvento.obter()).not.toBeNull();
  });

  it("guarda o resultado da análise e não reabre com etapa atrasada", () => {
    const qc = new QueryClient();
    const agendar = vi.fn();
    aplicarEvento(
      qc,
      { tipo: "analise", analiseId: "a9", roboId: "r1", concluida: true, resultado: "falhou" },
      agendar as never,
    );
    aplicarEvento(
      qc,
      {
        tipo: "analise",
        analiseId: "a9",
        roboId: "r1",
        concluida: false,
        etapa: { ferramenta: "f", descricao: "d", em: 2 },
      },
      agendar as never,
    );
    expect(lojaAnalises.obter().a9).toMatchObject({ concluida: true, resultado: "falhou" });
  });
});
