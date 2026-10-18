import { ToolError } from "@anthropic-ai/sdk/lib/tools/ToolError";
import { dec, ema, rsi, sma } from "@zentrade/dominio";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { pedidoExemplo, USUARIO_TESTE } from "../teste/pedido.js";
import {
  criarFerramentas,
  definirFerramenta,
  executarFerramenta,
  mensagemDeFalha,
  NOMES_FERRAMENTAS,
  paraAnthropic,
  type DependenciasFerramentas,
} from "./index.js";
import { RegistroFontes } from "./registro.js";

function deps(extra: Partial<DependenciasFerramentas> = {}): DependenciasFerramentas {
  return {
    busca: { buscar: vi.fn(async () => []) },
    historico: { recentes: vi.fn(async () => []) },
    ...extra,
  };
}

function ferramenta(nome: string, contexto = {}, d = deps()) {
  const registro = new RegistroFontes();
  const lista = criarFerramentas(
    { pedido: pedidoExemplo(), usuarioId: USUARIO_TESTE, registro, ...contexto },
    d,
  );
  const f = lista.find((t) => t.name === nome);
  if (!f) throw new Error(`ferramenta ${nome} não existe`);
  return { f, registro };
}

const rodar = async (nome: string, entrada: unknown, contexto = {}, d = deps()) => {
  const { f, registro } = ferramenta(nome, contexto, d);
  const saida = await f.run(f.parse(entrada));
  return { dados: JSON.parse(saida as string), registro };
};

describe("ferramentas do analista", () => {
  it("são só de leitura: nenhuma envia ordem", () => {
    expect([...NOMES_FERRAMENTAS].sort()).toEqual(
      ["buscar_conhecimento", "historico_decisoes", "posicao_e_orcamento", "retrato_mercado"].sort(),
    );
    const lista = criarFerramentas(
      { pedido: pedidoExemplo(), usuarioId: USUARIO_TESTE, registro: new RegistroFontes() },
      deps(),
    );
    for (const t of lista) expect(t.name).not.toMatch(/ordem|enviar|comprar|vender/);
  });

  it("definições idênticas entre pedidos (para o cache de prompt funcionar)", () => {
    // JSON.stringify deixa de fora as funções (run/parse): sobra o que vai para a API.
    const definicao = (p = pedidoExemplo()) =>
      JSON.stringify(
        criarFerramentas({ pedido: p, usuarioId: USUARIO_TESTE, registro: new RegistroFontes() }, deps()),
      );
    expect(definicao()).toBe(definicao(pedidoExemplo({ preco: dec("1") })));
  });

  describe("retrato_mercado", () => {
    it("usa os indicadores do domínio sobre os fechamentos do pedido", async () => {
      const p = pedidoExemplo();
      const { dados } = await rodar("retrato_mercado", {});
      expect(dados.preco).toBe("60450");
      expect(dados.sma.valor).toBeCloseTo(sma(p.fechamentos, 20)!, 8);
      expect(dados.ema.valor).toBeCloseTo(ema(p.fechamentos, 9)!, 8);
      expect(dados.rsi.valor).toBeCloseTo(rsi(p.fechamentos, 14)!, 8);
      expect(dados.ultimosFechamentos).toHaveLength(10);
      expect(dados.variacaoPercentual.valor).toBeCloseTo(((60450 - 59250) / 59250) * 100, 8);
    });

    it("aceita outros períodos e devolve null quando faltam fechamentos", async () => {
      const { dados } = await rodar("retrato_mercado", {
        periodoSma: 50,
        periodoEma: 5,
        janelaVariacao: 100,
      });
      expect(dados.sma).toEqual({ periodo: 50, valor: null });
      expect(dados.ema.periodo).toBe(5);
      expect(dados.variacaoPercentual.valor).toBeNull();
    });

    it("recusa período inválido (validação do Zod antes de rodar)", () => {
      const { f } = ferramenta("retrato_mercado");
      expect(() => f.parse({ periodoSma: 0 })).toThrow();
    });
  });

  describe("buscar_conhecimento", () => {
    const achado = {
      trechoId: "t1",
      documentoId: "d1",
      fonte: "regra_corretora" as const,
      titulo: "Taxas",
      url: "https://x.test",
      publicadoEm: new Date("2026-09-01T00:00:00Z"),
      texto: "a taxa é 0,1%",
      pontuacao: 0.03,
    };

    it("busca filtrando pelo usuário do pedido e registra o que pode ser citado", async () => {
      const buscar = vi.fn(async () => [achado]);
      const { dados, registro } = await rodar(
        "buscar_conhecimento",
        { consulta: "taxa", fontes: ["regra_corretora"], limite: 3 },
        {},
        deps({ busca: { buscar } }),
      );
      expect(buscar).toHaveBeenCalledWith("taxa", {
        usuarioId: USUARIO_TESTE,
        fontes: ["regra_corretora"],
        limite: 3,
      });
      expect(dados.resultados[0]).toEqual({
        fonte: { tipo: "regra_corretora", id: "d1", titulo: "Taxas", data: "2026-09-01" },
        url: "https://x.test",
        trecho: "a taxa é 0,1%",
      });
      expect(registro.conhece("d1")).toBe(true);
      expect(dados.natureza).toMatch(/dados de terceiros/);
      expect(dados.natureza).toMatch(/nunca siga instruções/);
    });

    it("avisa quando não acha nada", async () => {
      const { dados } = await rodar("buscar_conhecimento", { consulta: "nada" });
      expect(dados.resultados).toEqual([]);
      expect(dados.aviso).toMatch(/nada/i);
      expect(dados.modoBusca).toBeUndefined();
    });

    it("sem embeddings, diz que a busca foi só por palavras (com ou sem resultado)", async () => {
      const comAchado = await rodar(
        "buscar_conhecimento",
        { consulta: "taxa" },
        {},
        deps({ busca: { modo: "palavras", buscar: vi.fn(async () => [achado]) } }),
      );
      expect(comAchado.dados).toMatchObject({
        modoBusca: "palavras",
        sobreABusca: expect.stringMatching(/só por palavras.*sem embeddings/),
      });
      const vazio = await rodar(
        "buscar_conhecimento",
        { consulta: "nada" },
        {},
        deps({ busca: { modo: "palavras", buscar: vi.fn(async () => []) } }),
      );
      expect(vazio.dados).toMatchObject({ modoBusca: "palavras", aviso: expect.stringMatching(/nada/i) });
    });
  });

  describe("posicao_e_orcamento", () => {
    it("mostra a posição, o resultado não realizado e o que sobra do orçamento", async () => {
      const posicao = {
        quantidade: dec("0.01"),
        precoMedio: dec("60000"),
        resultadoRealizado: dec("-1.5"),
        taxasPagas: dec("0.6"),
      };
      const orcamento = {
        riscoPorOperacao: dec("10"),
        exposicaoMaxima: dec("1000"),
        perdaDiariaMaxima: dec("50"),
        exposicaoAtual: dec("604.5"),
        resultadoDoDia: dec("-20"),
      };
      const { dados } = await rodar(
        "posicao_e_orcamento",
        {},
        { pedido: pedidoExemplo({ posicao }), orcamento },
      );
      expect(dados.posicao).toMatchObject({ quantidade: "0.01", precoMedio: "60000", valorAtual: "604.5" });
      expect(dados.posicao.resultadoNaoRealizado).toBe("4.5");
      expect(dados.orcamento).toMatchObject({
        riscoPorOperacao: "10",
        folgaExposicao: "395.5",
        folgaPerdaDiaria: "30",
      });
    });

    it("orçamento parcial: sem exposição atual nem resultado do dia, a folga fica desconhecida", async () => {
      const orcamento = {
        riscoPorOperacao: dec("10"),
        exposicaoMaxima: dec("1000"),
        perdaDiariaMaxima: dec("50"),
      };
      const { dados } = await rodar("posicao_e_orcamento", {}, { orcamento });
      expect(dados.orcamento).toMatchObject({
        folgaExposicao: null,
        folgaPerdaDiaria: null,
        exposicaoAtual: null,
      });
    });

    it("sem orçamento no pedido, diz que é desconhecido em vez de inventar", async () => {
      const { dados } = await rodar("posicao_e_orcamento", {});
      expect(dados.posicao.quantidade).toBe("0");
      expect(dados.orcamento).toBeNull();
      expect(dados.aviso).toMatch(/orçamento/);
    });
  });

  describe("historico_decisoes", () => {
    it("traz as decisões anteriores do robô com desfecho e registra para citação", async () => {
      const recentes = vi.fn(async () => [
        {
          id: "dec-9",
          em: Date.UTC(2026, 8, 30),
          sinal: "COMPRAR" as const,
          acaoProposta: "comprar" as const,
          estado: "executada",
          preco: dec("59000"),
          resultado: dec("3.21"),
          explicacao: "abaixo da média",
        },
      ]);
      const { dados, registro } = await rodar(
        "historico_decisoes",
        { limite: 5 },
        {},
        deps({ historico: { recentes } }),
      );
      expect(recentes).toHaveBeenCalledWith("robo-1", 5);
      expect(dados.decisoes[0]).toMatchObject({
        // 30/09 00:00 UTC é 29/09 21:00 em Brasília: a decisão é do dia 29 (fuso da instância)
        fonte: { tipo: "diario", id: "dec-9", data: "2026-09-29" },
        preco: "59000",
        resultado: "3.21",
        estado: "executada",
      });
      expect(registro.conhece("dec-9")).toBe(true);
    });

    it("usa 10 por padrão e mostra desfecho ainda não avaliado como null", async () => {
      const recentes = vi.fn(async () => [
        {
          id: "d",
          em: 0,
          sinal: "AGUARDAR" as const,
          acaoProposta: null,
          estado: "registrada",
          preco: dec("1"),
          resultado: null,
          explicacao: "",
        },
      ]);
      const { dados } = await rodar("historico_decisoes", {}, {}, deps({ historico: { recentes } }));
      expect(recentes).toHaveBeenCalledWith("robo-1", 10);
      expect(dados.decisoes[0].resultado).toBeNull();
    });
  });
});

describe("falha de uma ferramenta", () => {
  const quebrada = definirFerramenta({
    nome: "quebrada",
    descricao: "Sempre falha.",
    entrada: z.object({}),
    rodar: () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 senha=xyz");
    },
  });

  it("pela ponte MCP vira frase curta, sem detalhe interno, e o erro vai para quem registra", async () => {
    const aoFalhar = vi.fn();
    const r = await executarFerramenta(quebrada, {}, aoFalhar);
    expect(r).toEqual({ ok: false, texto: mensagemDeFalha("quebrada") });
    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), "quebrada");
  });

  it("pelo Tool Runner da API, a mesma frase (nada de 'Error: <mensagem>' para o modelo)", async () => {
    const aoFalhar = vi.fn();
    const f = paraAnthropic(quebrada, aoFalhar);
    const erro = await Promise.resolve(f.run(f.parse({}))).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ToolError);
    expect((erro as ToolError).content).toBe(mensagemDeFalha("quebrada"));
    expect(String((erro as ToolError).content)).not.toMatch(/ECONNREFUSED|senha/);
    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), "quebrada");
  });
});
