import { CANAL_EVENTOS, EventoEsquema, type Corretora, type Evento } from "@zentrade/contratos";
import { dec, precoAlvo } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarMotor, type FontesMotor } from "../composicao.js";
import { lerConfig } from "../config.js";
import { Motor } from "../motor.js";
import { CHAVE_BATIDA_MOTOR } from "../portas/redis.js";
import { ate, corretoraDeTeste, montarAmbiente, QUINZE, registro, type AmbienteIntegracao } from "./ajuda.js";

const ALVO = precoAlvo(dec(94), 0.01, 0.001);

describe("motor com as portas do banco e o Redis (papel, ponta a ponta)", () => {
  let a: AmbienteIntegracao;
  let assinante: Redis;
  let eventos: Evento[] = [];

  beforeAll(async () => {
    a = await montarAmbiente();
    assinante = new Redis(a.redisUrl);
    assinante.on("message", (canal: string, msg: string) => {
      if (canal === CANAL_EVENTOS) eventos = [...eventos, EventoEsquema.parse(JSON.parse(msg))];
    });
    await assinante.subscribe(CANAL_EVENTOS);
  });
  afterAll(async () => {
    await assinante.quit();
    await a.encerrar();
  });

  const config = () =>
    lerConfig({
      MOTOR_REDE: "papel",
      DATABASE_URL: a.url,
      REDIS_URL: a.redisUrl,
      MOTOR_AGENTE_FIXO: "sempre_concorda",
    });

  function ligar(corretora: Corretora) {
    const r = registro();
    const fontes: FontesMotor = {
      banco: { portas: a.motorBanco.portas, mercado: a.motorBanco.mercado },
      redis: a.redis,
      corretora,
    };
    const { deps, opcoesMotor } = montarMotor(config(), fontes, r.registro);
    return { motor: new Motor(deps, opcoesMotor), erros: r.erros };
  }

  const decisoes = () => a.banco.decisoes.listar(a.usuarioId, { roboId: a.robo.id });
  const ordens = () => a.banco.ordens.listar(a.usuarioId, { roboId: a.robo.id });
  const inicio = Math.floor(Date.now() / QUINZE) * QUINZE - 20 * QUINZE;

  it("compra → venda no alvo → desfecho gravado na compra; eventos, candles e batida no Redis", async () => {
    const t = corretoraDeTeste(inicio);
    const { motor, erros } = ligar(t.corretora);
    expect(await motor.iniciar()).toEqual({ ligados: 1, falharam: 0 });
    expect(Number(await a.redis.get(CHAVE_BATIDA_MOTOR))).toBeGreaterThan(Date.now() - 60_000);

    t.fecharIntervalo(94);
    await motor.ocioso();
    t.fecharMinuto(ALVO.plus(0.1).toFixed(2));
    await motor.ocioso();
    await motor.parar();
    expect(erros).toEqual([]);

    const lista = await decisoes();
    const compra = lista.find((d) => d.sinal.acao === "COMPRAR");
    const venda = lista.find((d) => d.sinal.acao === "VENDER");
    expect(compra?.estado).toBe("executada");
    expect(venda?.estado).toBe("executada");
    expect(dec(compra?.desfecho?.resultado ?? "0").gt(0)).toBe(true);
    const posicao = await a.banco.robos.posicao(a.usuarioId, a.robo.id);
    expect(posicao?.quantidade).toBe("0");
    expect(compra?.desfecho?.resultado).toBe(posicao?.resultadoRealizado);
    expect((await ordens()).map((o) => o.estado)).toEqual(["PREENCHIDA", "PREENCHIDA"]);

    const gravados = await a.banco.mercado.candles({
      simbolo: "BTCUSDT",
      intervalo: "15m",
      inicio: inicio - 40 * QUINZE,
      fim: inicio + QUINZE,
    });
    expect(gravados.length).toBeGreaterThanOrEqual(31); // histórico + o candle fechado
    const tipos = await ate(
      async () => eventos.map((e) => e.tipo),
      (t) => t.includes("ordem") && t.includes("decisao") && t.includes("posicao"),
    );
    expect(tipos).toEqual(
      expect.arrayContaining(["preco", "decisao", "ordem", "saude", "candle", "sinal", "analise", "posicao"]),
    );
  });

  it("reinício com ordem pendente: o motor novo confere na corretora e não compra em dobro", async () => {
    const desde = Date.now() - 1;
    const t = corretoraDeTeste(inicio + 10 * QUINZE);
    const enviar = t.ordens.enviarOrdemMercado.bind(t.ordens);
    let falhar = true;
    t.ordens.enviarOrdemMercado = async (p) => {
      const r = await enviar(p); // entra na corretora...
      if (falhar) throw new Error("tempo esgotado"); // ...mas a resposta se perde
      return r;
    };
    const primeiro = ligar(t.corretora);
    await primeiro.motor.iniciar();
    t.fecharIntervalo(94);
    await primeiro.motor.ocioso();
    await primeiro.motor.parar(); // o processo "cai" com a ordem PENDENTE no banco
    expect(await a.motorBanco.portas.ordens.pendentes(a.robo.id)).toHaveLength(1);

    falhar = false;
    const segundo = ligar(t.corretora); // mesma corretora (a Binance não esquece a ordem)
    await segundo.motor.iniciar();
    t.fecharIntervalo(93);
    await segundo.motor.ocioso();
    expect(await a.motorBanco.portas.ordens.pendentes(a.robo.id)).toEqual([]);
    const recentes = (await ordens()).filter((o) => o.criadaEm >= desde);
    expect(recentes.filter((o) => o.lado === "COMPRA")).toHaveLength(1);
    expect(recentes[0]?.estado).toBe("PREENCHIDA");
    expect((await decisoes())[0]).toMatchObject({ estado: "executada", sinal: { acao: "COMPRAR" } });

    // Reinício do papel: o saldo simulado é refeito do banco e a venda no stop passa.
    await segundo.motor.parar();
    t.reiniciarPapel();
    const terceiro = ligar(t.corretora);
    await terceiro.motor.iniciar();
    t.fecharMinuto(90);
    await terceiro.motor.ocioso();
    await terceiro.motor.parar();
    const venda = (await ordens())[0];
    expect(venda).toMatchObject({ lado: "VENDA", estado: "PREENCHIDA" });
    const posicao = await a.banco.robos.posicao(a.usuarioId, a.robo.id);
    expect(posicao?.quantidade).toBe("0");
    const compras = (await decisoes()).filter((d) => d.sinal.acao === "COMPRAR");
    expect(dec(compras[0]?.desfecho?.resultado ?? "0").lt(0)).toBe(true);
  });

  it("robô pausado no banco sai na recarga; despausado volta", async () => {
    const t = corretoraDeTeste(inicio + 15 * QUINZE);
    const { motor } = ligar(t.corretora);
    await motor.iniciar();
    expect(motor.ligados()).toEqual([a.robo.id]);
    await a.banco.robos.atualizar(a.usuarioId, a.robo.id, { pausado: true });
    expect(await motor.recarregar()).toMatchObject({ desligados: 1 });
    expect(motor.ligados()).toEqual([]);
    await a.banco.robos.atualizar(a.usuarioId, a.robo.id, { pausado: false });
    expect(await motor.recarregar()).toMatchObject({ ligados: 1 });
    await motor.parar();
  });
});
