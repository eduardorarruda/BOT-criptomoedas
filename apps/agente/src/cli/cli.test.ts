import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirApiFalsa, TOKEN_TESTE, type ApiFalsa } from "../teste/api-falsa.js";
import { executarCli } from "./cli.js";

let api: ApiFalsa;
beforeAll(async () => {
  api = await subirApiFalsa();
});
afterAll(async () => api.fechar());

async function rodar(argv: string[], resposta = "", env?: Record<string, string>) {
  let saida = "";
  let erro = "";
  const perguntas: string[] = [];
  const codigo = await executarCli(argv, {
    env: env ?? { ZENTRADE_API_URL: api.url, ZENTRADE_TOKEN: TOKEN_TESTE },
    saida: { write: (s: string) => (saida += s) },
    erro: { write: (s: string) => (erro += s) },
    perguntar: async (p: string) => {
      perguntas.push(p);
      return resposta;
    },
  });
  return { codigo, saida, erro, perguntas };
}

describe("CLI zentrade", () => {
  it("status mostra o resumo em português, com dinheiro formatado", async () => {
    const r = await rodar(["status"]);
    expect(r.codigo).toBe(0);
    expect(r.saida).toMatch(/Parada total: desligada/);
    expect(r.saida).toMatch(/Resultado hoje: -US\$ 12,50|Resultado hoje: US\$ -12,50/);
    expect(r.saida).toMatch(/Robôs ativos: 2/);
    expect(r.saida).toMatch(/Custo de IA hoje: US\$ 0,43/);
  });

  it("decisoes lista as decisões e filtra por robô", async () => {
    const todas = await rodar(["decisoes"]);
    expect(todas.saida).toMatch(/dec-2/);
    expect(todas.saida).toMatch(/dec-1/);
    const doRobo = await rodar(["decisoes", "--robo", "robo-2", "--limite", "5"]);
    expect(doRobo.saida).toMatch(/dec-1/);
    expect(doRobo.saida).not.toMatch(/dec-2/);
    expect(api.pedidos.at(-1)!.caminho).toBe("/api/v1/decisoes?roboId=robo-2&limite=5");
  });

  it("explicar conta o porquê: sinal, proposta, fontes, risco e desfecho", async () => {
    const r = await rodar(["explicar", "dec-2"]);
    expect(r.codigo).toBe(0);
    expect(r.saida).toMatch(/Preço 2% abaixo da SMA/);
    expect(r.saida).toMatch(/comprar.*72%/s);
    expect(r.saida).toMatch(/Decisão dec-1/);
    expect(r.saida).toMatch(/exposição passaria do máximo/);
    expect(r.saida).toMatch(/barrada/);
    const comDesfecho = await rodar(["explicar", "dec-1"]);
    expect(comDesfecho.saida).toMatch(/Desfecho: US\$ 3,20/);
  });

  it("explicar sem id é erro de uso; id inexistente mostra a mensagem da API", async () => {
    expect((await rodar(["explicar"])).codigo).toBe(2);
    const r = await rodar(["explicar", "nada"]);
    expect(r.codigo).toBe(1);
    expect(r.erro).toMatch(/não existe/);
  });

  it("pausar-tudo liga a parada total", async () => {
    const r = await rodar(["pausar-tudo"]);
    expect(r.codigo).toBe(0);
    expect(api.pedidos.at(-1)).toMatchObject({
      metodo: "POST",
      caminho: "/api/v1/parada-total",
      corpo: { ligada: true },
    });
    expect(r.saida).toMatch(/ligada/i);
  });

  it("retomar-tudo pede confirmação digitada e cancela se não bater", async () => {
    const antes = api.pedidos.length;
    const r = await rodar(["retomar-tudo"], "sim");
    expect(r.perguntas[0]).toMatch(/RETOMAR/);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/cancelad/i);
    expect(api.pedidos.length).toBe(antes);
  });

  it("retomar-tudo confirmado chama a API e mostra quando ela exige reautenticação", async () => {
    const r = await rodar(["retomar-tudo"], "RETOMAR");
    expect(api.pedidos.at(-1)!.corpo).toEqual({ ligada: false });
    expect(r.codigo).toBe(1);
    expect(r.erro).toMatch(/confirmar a senha/);
  });

  it("backtest cria e depois mostra o resultado", async () => {
    const criar = await rodar([
      "backtest",
      "--estrategia",
      "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59",
      "--versao",
      "2",
      "--simbolo",
      "BTCUSDT",
      "--intervalo",
      "1h",
      "--inicio",
      "2026-01-01",
      "--fim",
      "2026-06-01",
    ]);
    expect(criar.codigo).toBe(0);
    expect(api.pedidos.at(-1)!.corpo).toEqual({
      estrategiaId: "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59",
      versao: 2,
      simbolo: "BTCUSDT",
      intervalo: "1h",
      inicio: Date.UTC(2026, 0, 1),
      fim: Date.UTC(2026, 5, 1),
    });
    expect(criar.saida).toMatch(/zentrade backtest bt-1/);
    const ver = await rodar(["backtest", "bt-1"]);
    expect(ver.saida).toMatch(/concluido/);
    expect(ver.saida).toMatch(/Operações: 17 · acertos 9 \(53%\)/);
    expect(ver.saida).toMatch(/Resultado líquido \(simulado\)/);
  });

  it("backtest com data inválida ou faltando opção é erro de uso", async () => {
    const r = await rodar([
      "backtest",
      "--estrategia",
      "e",
      "--versao",
      "1",
      "--simbolo",
      "BTCUSDT",
      "--intervalo",
      "1h",
      "--inicio",
      "ontem",
      "--fim",
      "2026-01-01",
    ]);
    expect(r.codigo).toBe(2);
    expect(r.erro).toMatch(/--inicio/);
    expect((await rodar(["backtest"])).codigo).toBe(2);
    const intervalo = await rodar([
      "backtest",
      "--estrategia",
      "e",
      "--versao",
      "1",
      "--simbolo",
      "BTCUSDT",
      "--intervalo",
      "2h",
      "--inicio",
      "2026-01-01",
      "--fim",
      "2026-02-01",
    ]);
    expect(intervalo.codigo).toBe(2);
    expect(intervalo.erro).toMatch(/--intervalo/);
  });

  it("ajuda, comando desconhecido e falta de token", async () => {
    const ajuda = await rodar(["--ajuda"]);
    expect(ajuda.codigo).toBe(0);
    expect(ajuda.saida).toMatch(/zentrade status/);
    expect((await rodar([])).codigo).toBe(0);
    const desconhecido = await rodar(["voar"]);
    expect(desconhecido.codigo).toBe(2);
    expect(desconhecido.erro).toMatch(/voar/);
    const semToken = await rodar(["status"], "", {});
    expect(semToken.codigo).toBe(1);
    expect(semToken.erro).toMatch(/ZENTRADE_TOKEN/);
    const opcaoRuim = await rodar(["status", "--xyz"]);
    expect(opcaoRuim.codigo).toBe(2);
  });
});
