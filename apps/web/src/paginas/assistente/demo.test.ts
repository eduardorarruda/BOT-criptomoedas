import type { EventoChat } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { criarApiAssistenteDemo } from "./demo";

async function todos(gen: AsyncIterable<EventoChat>): Promise<EventoChat[]> {
  const lista: EventoChat[] = [];
  for await (const e of gen) lista.push(e);
  return lista;
}

const AGORA = new Date(2026, 9, 11, 15, 0).getTime();
const rapida = () => criarApiAssistenteDemo({ atrasoMs: 0, agora: () => AGORA });

describe("assistente de demonstração", () => {
  it("já vem com conversas de exemplo em datas diferentes", async () => {
    const api = rapida();
    const lista = await api.conversas();
    expect(lista.length).toBeGreaterThanOrEqual(3);
    const conversa = await api.conversa(lista[0]?.id ?? "");
    expect(conversa.mensagens.length).toBeGreaterThan(0);
    expect(new Set(lista.map((c) => new Date(c.atualizadaEm).toDateString())).size).toBeGreaterThan(1);
  });

  it("a resposta chega aos pedaços, com etapa, tabela, código e fontes, e fica gravada", async () => {
    const api = rapida();
    const nova = await api.criarConversa();
    const eventos = await todos(
      api.enviar(nova.id, "Resumo da minha carteira cripto", new AbortController().signal),
    );
    expect(eventos[0]?.tipo).toBe("inicio");
    expect(eventos.some((e) => e.tipo === "ferramenta")).toBe(true);
    const texto = eventos.flatMap((e) => (e.tipo === "texto" ? [e.delta] : [])).join("");
    expect(eventos.filter((e) => e.tipo === "texto").length).toBeGreaterThan(3);
    expect(texto).toContain("|");
    expect(texto).toContain("```");
    expect(eventos.some((e) => e.tipo === "fontes" && e.fontes.length > 0)).toBe(true);
    const fim = eventos.at(-1);
    expect(fim?.tipo).toBe("fim");
    const gravada = await api.conversa(nova.id);
    expect(gravada.mensagens.map((m) => m.papel)).toEqual(["usuario", "assistente"]);
    expect(gravada.mensagens[1]?.texto).toBe(texto);
    expect(gravada.titulo).toBe("Resumo da minha carteira cripto");
    expect((await api.conversas())[0]?.id).toBe(nova.id);
  });

  it("parar no meio grava a resposta como interrompida, com o que já tinha chegado", async () => {
    const api = rapida();
    const nova = await api.criarConversa();
    const controle = new AbortController();
    const recebidos: EventoChat[] = [];
    for await (const e of api.enviar(nova.id, "Como estão meus robôs hoje?", controle.signal)) {
      recebidos.push(e);
      if (e.tipo === "texto") controle.abort();
    }
    expect(recebidos.some((e) => e.tipo === "fim")).toBe(false);
    const gravada = await api.conversa(nova.id);
    expect(gravada.mensagens[1]?.situacao).toBe("interrompida");
  });

  it("renomeia, apaga e troca o provedor em memória", async () => {
    const api = rapida();
    const nova = await api.criarConversa();
    expect((await api.renomear(nova.id, "Minha conversa")).titulo).toBe("Minha conversa");
    await api.apagar(nova.id);
    await expect(api.conversa(nova.id)).rejects.toMatchObject({ codigo: "nao_encontrado" });
    expect((await api.mudarConfig({ provedor: "cli", modelo: "sonnet" })).config).toMatchObject({
      provedor: "cli",
      modelo: "sonnet",
    });
    expect((await api.estado()).config.provedor).toBe("cli");
  });
});

describe("respostas de exemplo", () => {
  it("cada sugestão da tela cai na resposta certa", async () => {
    const { respostaPara } = await import("./demoRespostas");
    expect(respostaPara("Como estão meus robôs hoje?").ferramentas[0]?.nome).toBe("listar_robos");
    expect(respostaPara("Resumo da minha carteira cripto").ferramentas[0]?.nome).toBe("carteira_cripto");
    expect(respostaPara("Quando vencem meus títulos de renda fixa?").ferramentas[0]?.nome).toBe("renda_fixa");
    expect(respostaPara("Explique a última decisão do robô BTC Médias").ferramentas[0]?.nome).toBe(
      "decisoes_recentes",
    );
    expect(respostaPara("qualquer outra coisa").ferramentas[0]?.nome).toBe("buscar_conhecimento");
  });
});
