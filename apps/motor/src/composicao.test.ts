import { BinanceCorretora, PapelCorretora } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { criarAgente, criarCorretora, montarDependencias } from "./composicao.js";
import { lerConfig } from "./config.js";
import { CorretoraPapelAoVivo } from "./papel-ao-vivo.js";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { AgenteHttp } from "./portas/agente-http.js";
import { EventosNoRegistro } from "./portas/eventos-registro.js";
import { criarRegistro } from "./registro.js";
import { registroDeTeste } from "./teste/cenario.js";
import { candle } from "./teste/candles.js";

describe("composição do motor", () => {
  it("papel: dados de mercado de uma rede, ordens simuladas no papel", () => {
    const c = criarCorretora(lerConfig({}), registroDeTeste().registro);
    expect(c).toBeInstanceOf(CorretoraPapelAoVivo);
    expect(c.rede).toBe("papel");
  });

  it("testnet: Binance testnet com as chaves do ambiente", () => {
    const c = criarCorretora(
      lerConfig({ MOTOR_REDE: "testnet", BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s" }),
      registroDeTeste().registro,
    );
    expect(c).toBeInstanceOf(BinanceCorretora);
    expect(c.rede).toBe("testnet");
  });

  it("agente: HTTP quando há URL; senão o fixo configurado", () => {
    expect(
      criarAgente(lerConfig({ AGENTE_URL: "http://agente:8081", AGENTE_SEGREDO: "x".repeat(32) })),
    ).toBeInstanceOf(AgenteHttp);
    expect(criarAgente(lerConfig({}))).toBeInstanceOf(AgenteFixo);
  });

  it("monta as dependências com portas em memória e aplica os robôs pausados", async () => {
    const config = lerConfig({ MOTOR_AGENTE_OBRIGATORIO: "false" });
    const robo = { id: "r1" } as never;
    const { deps, robos } = montarDependencias(
      config,
      { robos: [robo], pausados: ["r1"] },
      registroDeTeste().registro,
    );
    expect(deps.opcoes.agenteObrigatorio).toBe(false);
    expect(deps.opcoes.tamanhoHistorico).toBe(500);
    expect(await robos.ativos()).toEqual([robo]);
    expect(await deps.robos.pausado("r1")).toBe(true);
    expect(deps.eventos).toBeInstanceOf(EventosNoRegistro);
  });
});

describe("papel ao vivo", () => {
  it("preço e filtros vêm da fonte de dados; ordens e saldo, do papel", async () => {
    const dados = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
    dados.alimentar("BTCUSDT", "1m", candle(0, 100));
    const papel = new PapelCorretora({ saldos: { USDT: dec(1000) }, taxa: 0.001, deslizamentoBps: 0 });
    const c = new CorretoraPapelAoVivo(dados, papel);
    expect((await c.candles("BTCUSDT", "1m", 10)).length).toBe(1);
    await c.filtros("BTCUSDT");
    expect((await c.livro("BTCUSDT", 5)).compras[0]!.preco.equals(dec(100))).toBe(true);
    const recebidos: number[] = [];
    const parar = c.assinarCandles("BTCUSDT", "1m", (x) => recebidos.push(x.abertura));
    dados.alimentar("BTCUSDT", "1m", candle(60_000, 110));
    parar();
    expect(recebidos).toEqual([60_000]);
    const r = await c.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec(1),
      idCliente: "a",
    });
    expect(r.execucoes[0]!.preco.equals(dec(110))).toBe(true); // o último preço do stream
    expect((await c.saldoLivre("BTC")).equals(dec(1))).toBe(true);
    expect(await c.consultarOrdem("BTCUSDT", "a")).toBe(r);
  });
});

describe("registro (pino)", () => {
  it("JSON com o serviço, erro serializado e segredo oculto", () => {
    const linhas: string[] = [];
    const destino = new Writable({ write: (pedaco, _c, feito) => (linhas.push(String(pedaco)), feito()) });
    const r = criarRegistro("info", destino);
    r.error({ erro: new Error("caiu"), apiSecret: "nao-mostrar" }, "falhou");
    const linha = JSON.parse(linhas[0]!) as {
      servico: string;
      erro: { message: string };
      apiSecret: string;
      msg: string;
    };
    expect(linha.servico).toBe("motor");
    expect(linha.erro.message).toBe("caiu");
    expect(linha.apiSecret).toBe("[oculto]");
    expect(linha.msg).toBe("falhou");
    new EventosNoRegistro(r).publicar({ tipo: "saude", servico: "motor", ok: true, em: 1 });
  });
});
