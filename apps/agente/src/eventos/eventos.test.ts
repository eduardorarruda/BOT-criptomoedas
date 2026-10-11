import { CANAL_EVENTOS, EventoAnaliseEsquema, type EventoAnalise } from "@zentrade/contratos";
import { describe, expect, it, vi } from "vitest";
import { descreverEtapa } from "./descrever.js";
import { observadorDaAnalise, publicadorNulo, publicadorRedis } from "./publicador.js";

describe("descreverEtapa", () => {
  it("frases curtas em português para cada ferramenta", () => {
    expect(descreverEtapa("retrato_mercado")).toMatch(/preço e os indicadores/);
    expect(descreverEtapa("posicao_e_orcamento")).toMatch(/orçamento de risco/);
    expect(descreverEtapa("historico_decisoes")).toMatch(/decisões anteriores/);
    expect(descreverEtapa("ferramenta_nova")).toBe("Consultando ferramenta nova");
  });

  it("a busca mostra o termo, aparado e cortado", () => {
    expect(descreverEtapa("buscar_conhecimento", { consulta: "  taxa   de saque " })).toBe(
      "Buscando no seu conhecimento: “taxa de saque”",
    );
    expect(descreverEtapa("buscar_conhecimento", { consulta: "x".repeat(200) })).toHaveLength(112);
    expect(descreverEtapa("buscar_conhecimento", {})).toBe("Buscando no seu conhecimento");
  });
});

describe("publicadorRedis", () => {
  const evento: EventoAnalise = {
    tipo: "analise",
    analiseId: "a1",
    roboId: "r1",
    etapa: { ferramenta: "retrato_mercado", descricao: "x", em: 1 },
    concluida: false,
  };

  it("publica no canal de eventos, no formato do contrato", async () => {
    const publish = vi.fn(async () => 1);
    await publicadorRedis({ publish }, { warn: vi.fn() }).publicar(evento);
    const [canal, corpo] = publish.mock.calls[0] as unknown as [string, string];
    expect(canal).toBe(CANAL_EVENTOS);
    expect(EventoAnaliseEsquema.parse(JSON.parse(corpo))).toEqual(evento);
  });

  it("falha no Redis vira aviso no log, não erro", async () => {
    const warn = vi.fn();
    const publish = vi.fn(async () => {
      throw new Error("redis caiu");
    });
    await expect(publicadorRedis({ publish }, { warn }).publicar(evento)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    await expect(publicadorNulo.publicar(evento)).resolves.toBeUndefined();
  });
});

describe("observadorDaAnalise", () => {
  it("cada ferramenta consultada vira uma etapa com o analiseId do pedido", () => {
    const publicados: EventoAnalise[] = [];
    const observar = observadorDaAnalise({
      analiseId: "an-1",
      roboId: "robo-1",
      publicador: { publicar: async (e) => void publicados.push(e) },
      agora: () => 42,
    });
    observar!("buscar_conhecimento", { consulta: "taxa" });
    expect(publicados).toEqual([
      {
        tipo: "analise",
        analiseId: "an-1",
        roboId: "robo-1",
        etapa: {
          ferramenta: "buscar_conhecimento",
          descricao: "Buscando no seu conhecimento: “taxa”",
          em: 42,
        },
        concluida: false,
      },
    ]);
  });

  it("sem analiseId não há observador", () => {
    expect(
      observadorDaAnalise({ analiseId: undefined, roboId: "r", publicador: publicadorNulo }),
    ).toBeUndefined();
  });
});
