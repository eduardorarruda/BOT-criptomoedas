import { BinanceCorretora, PapelCorretora } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  criarAgente,
  criarCorretora,
  criarDadosPublicos,
  montarMotor,
  type FontesMotor,
} from "./composicao.js";
import { lerConfig } from "./config.js";
import { CorretoraPapelAoVivo } from "./papel-ao-vivo.js";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { AgenteHttp } from "./portas/agente-http.js";
import { EventosNoRegistro } from "./portas/eventos-registro.js";
import { AprovacaoMemoria, DecisoesMemoria, OrdensMemoria, RobosMemoria } from "./portas/memoria.js";
import { EventosRedis, type ClienteRedis } from "./portas/redis.js";
import { RelogioManual } from "./relogio.js";
import { criarRegistro } from "./registro.js";
import { montarCenario, registroDeTeste } from "./teste/cenario.js";
import { candle } from "./teste/candles.js";

describe("composição do motor", () => {
  it("papel: dados de mercado de uma rede, ordens simuladas no papel", () => {
    const c = criarCorretora(lerConfig({}), registroDeTeste().registro);
    expect(c).toBeInstanceOf(CorretoraPapelAoVivo);
    expect(c.rede).toBe("papel");
  });

  it("testnet: Binance testnet (as chaves do ambiente só em desenvolvimento)", () => {
    const c = criarCorretora(
      lerConfig({
        MOTOR_REDE: "testnet",
        ZENTRADE_AMBIENTE: "desenvolvimento",
        BINANCE_API_KEY: "k",
        BINANCE_API_SECRET: "s",
        DATABASE_URL: "postgres://x@127.0.0.1/z",
      }),
      registroDeTeste().registro,
    );
    expect(c).toBeInstanceOf(BinanceCorretora);
    expect(c.rede).toBe("testnet");
  });

  it("testnet com banco: cada robô liga com a corretora da pessoa dona dele", async () => {
    const config = lerConfig({
      MOTOR_REDE: "testnet",
      DATABASE_URL: "postgres://x@127.0.0.1/z",
      ZENTRADE_CHAVE_MESTRA: Buffer.alloc(32, 3).toString("base64"),
    });
    const credenciais = {
      binance: async (u: string) => (u === "ana" ? { apiKey: "k", apiSecret: "s" } : null),
    };
    const fontes: FontesMotor = {
      banco: {
        portas: {
          robos: new RobosMemoria([]),
          decisoes: new DecisoesMemoria(),
          ordens: new OrdensMemoria(new RelogioManual(0)),
        },
        mercado: { gravar: async () => undefined },
        credenciais,
      },
    };
    const { opcoesMotor } = montarMotor(config, fontes, registroDeTeste().registro);
    const robo = (usuarioId: string) => ({ id: "r", usuarioId, rede: "testnet" }) as never;
    const corretora = await opcoesMotor.corretoraDe!(robo("ana"));
    expect(corretora).toBeInstanceOf(BinanceCorretora);
    expect(corretora.rede).toBe("testnet");
    await expect(opcoesMotor.corretoraDe!(robo("beto"))).rejects.toThrow(/Contas e chaves/);
  });

  it("papel ou corretora trocada (testes): sem corretora por pessoa", () => {
    const { opcoesMotor } = montarMotor(lerConfig({}), {}, registroDeTeste().registro);
    expect(opcoesMotor.corretoraDe).toBeUndefined();
  });

  it("agente: HTTP quando há URL; senão o fixo configurado", () => {
    expect(
      criarAgente(lerConfig({ AGENTE_URL: "http://agente:8081", AGENTE_SEGREDO: "x".repeat(32) })),
    ).toBeInstanceOf(AgenteHttp);
    expect(criarAgente(lerConfig({}))).toBeInstanceOf(AgenteFixo);
  });

  it("sem banco: portas em memória com os robôs do arquivo, eventos no registro, sem recarga", async () => {
    const config = lerConfig({ MOTOR_AGENTE_OBRIGATORIO: "false", APROVACAO_VALIDADE_MIN: "3" });
    const robo = { id: "r1", rede: "papel" } as never;
    const { deps, opcoesMotor } = montarMotor(
      config,
      { arquivo: { robos: [robo], pausados: ["r1"] } },
      registroDeTeste().registro,
    );
    expect(deps.opcoes.agenteObrigatorio).toBe(false);
    expect(deps.opcoes.tamanhoHistorico).toBe(500);
    expect(deps.opcoes.expiracaoAprovacaoMs).toBe(3 * 60_000);
    expect(await deps.robos.ativos()).toEqual([robo]);
    expect(await deps.robos.pausado("r1")).toBe(true);
    expect(deps.eventos).toBeInstanceOf(EventosNoRegistro);
    expect(deps.decisoes).toBeInstanceOf(DecisoesMemoria);
    expect(deps.aprovacao).toBeInstanceOf(AprovacaoMemoria);
    expect(deps.candles).toBeUndefined();
    expect(opcoesMotor).toEqual({ intervaloSaudeMs: 30_000, alertaWebSocketMs: 5 * 60_000 });
    expect(deps.riscoConta).toBeUndefined();
    await deps.aprovacao.solicitar("d1", "x", 1);
  });

  it("com banco e Redis: portas do banco, só os robôs da rede do motor, eventos e batida no Redis", async () => {
    const c = montarCenario();
    const robos = new RobosMemoria([c.robo, { ...c.robo, id: "t1", rede: "testnet" }]);
    const gravadas: unknown[][] = [];
    const redis: ClienteRedis = {
      publish: async () => 1,
      set: async (...a: unknown[]) => void gravadas.push(a),
    };
    const ordens = new OrdensMemoria(new RelogioManual(0));
    const mercado = { gravar: async () => undefined };
    const riscoConta = {
      estado: async () => {
        throw new Error("banco fora");
      },
    };
    const fontes: FontesMotor = {
      banco: { portas: { robos, decisoes: c.decisoes, ordens }, mercado, riscoConta },
      redis,
    };
    const { registro } = registroDeTeste();
    const { deps, opcoesMotor } = montarMotor(
      lerConfig({ MOTOR_RECARGA_SEGUNDOS: "12", MOTOR_ALERTA_WEBSOCKET_MIN: "7" }),
      fontes,
      registro,
    );
    // a porta da conta vem embrulhada: erro do banco vira "conta indisponível" (só barra compra)
    expect((await deps.riscoConta?.estado("r1", 1))?.indisponivel).toBe("banco fora");
    expect(opcoesMotor.alertaWebSocketMs).toBe(7 * 60_000);
    expect((await deps.robos.ativos()).map((r) => r.id)).toEqual(["r1"]);
    expect(deps.decisoes).toBe(c.decisoes);
    expect(deps.ordens).toBe(ordens);
    expect(deps.candles).toBe(mercado);
    expect(deps.eventos).toBeInstanceOf(EventosRedis);
    expect(opcoesMotor.intervaloRecargaMs).toBe(12_000);
    await opcoesMotor.bater?.(123);
    expect(gravadas).toEqual([["zentrade:motor:batida", "123", "EX", 3600]]);
    await deps.aprovacao.solicitar("d1", "Comprar", 5); // a API repassa ao n8n: aqui só registra
  });

  it("papel com banco: antes de ligar, o saldo simulado é refeito com as execuções gravadas (uma vez por robô)", async () => {
    const ordens = new OrdensMemoria(new RelogioManual(0));
    const robo = { id: "r1", simbolo: "BTCUSDT", rede: "papel" } as never;
    await ordens.reservar({
      decisaoId: "d",
      roboId: "r1",
      idCliente: "zt-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec(1),
    });
    await ordens.concluir("zt-1", {
      idCliente: "zt-1",
      idCorretora: "1",
      estado: "PREENCHIDA",
      execucoes: [{ lado: "COMPRA", preco: dec(100), quantidade: dec(1), taxaCotacao: dec("0.1"), em: 1 }],
    });
    const fontes: FontesMotor = {
      banco: {
        portas: { robos: new RobosMemoria([robo]), decisoes: new DecisoesMemoria(), ordens },
        mercado: { gravar: async () => undefined },
      },
    };
    const { deps, opcoesMotor } = montarMotor(lerConfig({}), fontes, registroDeTeste().registro);
    await opcoesMotor.preparar?.(robo);
    await opcoesMotor.preparar?.(robo);
    expect((await deps.corretora.saldoLivre("BTC")).toFixed()).toBe("1");
    expect((await deps.corretora.saldoLivre("USDT")).toFixed()).toBe("899.9");
    expect(deps.eventos).toBeInstanceOf(EventosNoRegistro);
    expect(opcoesMotor.bater).toBeUndefined();
  });

  it("dados públicos para o backtest: Binance sem chave", () => {
    const c = criarDadosPublicos(lerConfig({ MOTOR_PAPEL_DADOS: "real" }), registroDeTeste().registro);
    expect(c).toBeInstanceOf(BinanceCorretora);
    expect(c.rede).toBe("real");
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
