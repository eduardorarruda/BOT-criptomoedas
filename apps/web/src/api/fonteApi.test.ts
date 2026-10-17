import { describe, expect, it, vi } from "vitest";
import type { ClienteApi } from "./cliente";
import { ErroApi } from "./erros";
import { criarFonteApi } from "./fonteApi";

function clienteFalso(resposta: unknown = undefined) {
  const pedir = vi.fn(async (..._a: unknown[]) => resposta);
  return { cliente: { pedir } as unknown as ClienteApi, pedir };
}

describe("fonte da API", () => {
  it("devolve null quando não há sessão", async () => {
    const pedir = vi.fn(async () => {
      throw new ErroApi("nao_autenticado", "x", 401);
    });
    const fonte = criarFonteApi({ pedir } as unknown as ClienteApi);
    await expect(fonte.obterSessao()).resolves.toBeNull();
  });

  it("repassa outros erros da sessão", async () => {
    const pedir = vi.fn(async () => {
      throw new ErroApi("sem_conexao", "x");
    });
    const fonte = criarFonteApi({ pedir } as unknown as ClienteApi);
    await expect(fonte.obterSessao()).rejects.toMatchObject({ codigo: "sem_conexao" });
  });

  it("2FA: gera o segredo e ativa com o código", async () => {
    const { cliente, pedir } = clienteFalso({ segredo: "ABC", uri: "otpauth://totp/x?secret=ABC" });
    const f = criarFonteApi(cliente);
    await expect(f.iniciarDoisFatores()).resolves.toMatchObject({ segredo: "ABC" });
    await f.ativarDoisFatores("123456");
    expect(pedir.mock.calls.map((c) => [c[0], c[1], c[3]])).toEqual([
      ["POST", "/sessao/2fa", undefined],
      ["POST", "/sessao/2fa/ativar", { codigo: "123456" }],
    ]);
  });

  it("cria robô sempre observando", async () => {
    const { cliente, pedir } = clienteFalso({});
    await criarFonteApi(cliente).criarRobo({
      nome: "r",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      rede: "papel",
      estrategiaId: "e",
      estrategiaVersao: 1,
      limites: {
        perdaDiariaMaxima: "10",
        exposicaoMaxima: "100",
        riscoPorOperacao: "5",
        ordensPorHoraMax: 4,
        pausaAposPerdaMin: 30,
        confiancaMinima: 0.6,
      },
    });
    expect(pedir).toHaveBeenCalledWith(
      "POST",
      "/robos",
      expect.anything(),
      expect.objectContaining({ modo: "observar" }),
    );
  });

  it("ao vivo: histórico de um robô ou de todos, já sem o envelope", async () => {
    const { cliente, pedir } = clienteFalso({ eventos: [{ recebidoEm: 1 }] });
    const f = criarFonteApi(cliente);
    await expect(f.aoVivo("r/1")).resolves.toEqual([{ recebidoEm: 1 }]);
    await f.aoVivo();
    expect(pedir.mock.calls.map((c) => c[1])).toEqual(["/aovivo/r%2F1/recentes", "/aovivo/recentes"]);
  });

  it("fala com os caminhos do contrato", async () => {
    const { cliente, pedir } = clienteFalso({ ligada: true, usuario: { id: "u", email: "a@b" } });
    const f = criarFonteApi(cliente);
    await f.definirParadaTotal(true);
    await f.aprovarDecisao("d/1");
    await f.recusarDecisao("d2");
    await f.candles("BTCUSDT", "1h");
    await f.decisoes({ estado: "aguardando_aprovacao" });
    await f.removerConta("c1");
    await f.revogarToken("t1");
    await f.sair();
    await f.confirmarIdentidade({ senha: "s" });
    await f.entrar({ email: "a", senha: "b" });
    const caminhos = pedir.mock.calls.map((c) => `${c[0] as string} ${c[1] as string}`);
    expect(caminhos).toEqual([
      "POST /parada-total",
      "POST /decisoes/d%2F1/aprovar",
      "POST /decisoes/d2/recusar",
      "GET /mercado/BTCUSDT/candles",
      "GET /decisoes",
      "DELETE /contas-corretora/c1",
      "DELETE /tokens/t1",
      "DELETE /sessao",
      "POST /sessao/confirmar",
      "POST /sessao",
    ]);
  });

  it("lista recursos pelos caminhos certos", async () => {
    const { cliente, pedir } = clienteFalso([]);
    const f = criarFonteApi(cliente);
    await Promise.all([
      f.resumo(),
      f.patrimonio(),
      f.saude(),
      f.estrategias(),
      f.criarEstrategia({} as never),
      f.novaVersaoEstrategia("e1", {} as never),
      f.robos(),
      f.atualizarRobo("r1", { pausado: true }),
      f.posicao("r1"),
      f.ordens("r1"),
      f.contas(),
      f.criarConta({} as never),
      f.tokens(),
      f.criarToken("cli", "leitura"),
      f.backtests(),
      f.criarBacktest({} as never),
      f.backtest("b1"),
      f.documentos(),
      f.criarNota({ titulo: "t", texto: "x" }),
      f.automacoes(),
    ]);
    expect(pedir.mock.calls.map((c) => c[1])).toContain("/robos/r1/posicao");
    expect(pedir.mock.calls.map((c) => c[1])).toContain("/estrategias/e1/versoes");
    expect(pedir).toHaveBeenCalledTimes(20);
  });
});
