import { describe, expect, it, vi } from "vitest";
import { criarFerramentas, type DependenciasFerramentas } from "./ferramentas/index.js";
import { RegistroFontes } from "./ferramentas/registro.js";
import { buscarContextoPrevio, linhasDoPrevio } from "./pedido/previo.js";
import { mensagemDoPedido } from "./prompt.js";
import { lerCorpoAnalise, pedidoDeJson, pedidoParaJson } from "./serializacao.js";
import { pedidoExemplo, USUARIO_TESTE } from "./teste/pedido.js";

const ATE = Date.parse("2026-07-15T10:00:00Z");

function deps(): DependenciasFerramentas & {
  buscar: ReturnType<typeof vi.fn>;
  recentes: ReturnType<typeof vi.fn>;
} {
  const buscar = vi.fn(async () => []);
  const recentes = vi.fn(async () => []);
  return { busca: { buscar }, historico: { recentes }, buscar, recentes };
}

describe("replay histórico: o pedido com `ate` não olha o futuro", () => {
  it("o `ate` atravessa o fio nos dois sentidos e o corpo é validado", () => {
    const pedido = pedidoExemplo({ ate: ATE });
    const json = pedidoParaJson(pedido);
    expect(json.ate).toBe(ATE);
    expect(pedidoDeJson(json).ate).toBe(ATE);
    expect(pedidoParaJson(pedidoExemplo())).not.toHaveProperty("ate");
    expect(lerCorpoAnalise({ ...json, ate: -1 }).ok).toBe(false);
  });

  it("sem `ate` as quatro ferramentas continuam; com `ate`, saem as que leem o banco ao vivo", () => {
    const nomes = (ate?: number) =>
      criarFerramentas(
        {
          pedido: pedidoExemplo(ate === undefined ? {} : { ate }),
          usuarioId: USUARIO_TESTE,
          registro: new RegistroFontes(),
        },
        deps(),
      ).map((f) => f.name);
    expect(nomes()).toContain("buscar_conhecimento");
    expect(nomes()).toContain("historico_decisoes");
    expect(nomes(ATE).sort()).toEqual(["posicao_e_orcamento", "retrato_mercado"]);
  });

  it("o contexto prévio do replay não consulta nenhuma porta e diz que está desligado", async () => {
    const d = deps();
    const previo = await buscarContextoPrevio(pedidoExemplo({ ate: ATE }), USUARIO_TESTE, d, new Date(ATE));
    expect(d.buscar).not.toHaveBeenCalled();
    expect(d.recentes).not.toHaveBeenCalled();
    const texto = linhasDoPrevio(previo, "America/Sao_Paulo").join("\n");
    expect(texto).toMatch(/replay/i);
    expect(texto).not.toMatch(/nenhuma notícia|use historico_decisoes|buscar_conhecimento/);
  });

  it("a mensagem usa o instante do sinal como `agora`, não o relógio de hoje", () => {
    const texto = mensagemDoPedido(pedidoExemplo({ ate: ATE }), new Date(ATE), {
      fuso: "UTC",
      previo: { decisoes: [], base: null, replay: true },
    });
    expect(texto).toContain("2026-07-15T10:00");
  });
});
