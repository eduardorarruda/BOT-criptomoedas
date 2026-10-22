import { randomUUID } from "node:crypto";
import {
  AvisoEsquema,
  CANAL_EVENTOS,
  DivergenciaEsquema,
  LIMITES_CONTA_PADRAO,
  SituacaoContaEsquema,
  type Evento,
} from "@zentrade/contratos";
import { Disjuntor } from "@zentrade/corretora";
import { dec, posicaoDe, type Lado } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarServicoCarteira } from "../integracoes/binance-carteira.js";
import { fabricaContaBinance } from "../integracoes/binance-conta.js";
import { comSessao, montarApi, SENHA, type Api, type Pessoa } from "./ajuda.js";
import { estadoInicial, fetchDaBinanceFalsa } from "./binance-falsa.js";

const LIMITES = {
  perdaDiariaMaxima: "10",
  exposicaoMaxima: "100",
  riscoPorOperacao: "1",
  ordensPorHoraMax: 5,
  pausaAposPerdaMin: 0,
  confiancaMinima: 0.5,
  diasDeEvento: "ignorar" as const,
  agente: "decide" as const,
};
const CINCO_MIN = 5 * 60_000;

describe("risco da conta pela API: limites, divergências, avisos e chave sem saque", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let roboAna: string;
  let publicador: Redis;
  const binance = estadoInicial(Date.now());
  const fabrica = fabricaContaBinance({
    disjuntorDe: () => new Disjuntor(),
    fetch: fetchDaBinanceFalsa(binance),
    agora: () => binance.agora,
    dormir: async () => undefined,
  });

  const chamar = (p: Pessoa, method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });
  const reautenticar = (p: Pessoa) => chamar(p, "POST", "/sessao/confirmar", { senha: SENHA });
  const esperar = async (condicao: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await condicao()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("a condição não aconteceu a tempo");
  };
  const avisosDe = async (p: Pessoa) =>
    AvisoEsquema.array().parse((await chamar(p, "GET", "/avisos")).json());

  async function criarRobo(dona: Pessoa): Promise<string> {
    const estrategia = await api.banco.estrategias.criar(dona.id, {
      nome: "e",
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">",
        direita: { tipo: "numero", valor: 1 },
      },
      stop: 0.02,
      alvoLiquido: 0.01,
      taxa: 0.001,
    });
    const robo = await api.banco.robos.criar(dona.id, {
      nome: "BTC da conta",
      simbolo: "BTCUSDT",
      intervalo: "15m",
      modo: "auto",
      rede: "testnet",
      estrategiaId: estrategia.id,
      estrategiaVersao: 1,
      limites: LIMITES,
    });
    return robo.id;
  }

  async function executar(roboId: string, lado: Lado, qtd: string, preco: string) {
    const decisaoId = await api.banco.portas.decisoes.registrar({
      roboId,
      em: Date.now(),
      sinal: { acao: "COMPRAR", stop: dec(1), alvo: dec(1_000_000), explicacao: "entrada" },
      preco: dec(preco),
      quantidade: dec(qtd),
      risco: { aprovada: true, barreiras: [] },
      estado: "executada",
    });
    const idCliente = `t-${randomUUID().slice(0, 20)}`;
    await api.banco.portas.ordens.reservar({
      decisaoId,
      roboId,
      idCliente,
      simbolo: "BTCUSDT",
      lado,
      quantidade: dec(qtd),
    });
    await api.banco.portas.ordens.concluir(idCliente, {
      idCliente,
      idCorretora: "1",
      estado: "PREENCHIDA",
      execucoes: [{ lado, preco: dec(preco), quantidade: dec(qtd), taxaCotacao: dec(0), em: Date.now() }],
    });
  }

  beforeAll(async () => {
    api = await montarApi({
      ambiente: { CARTEIRA_SINCRONIZAR_MIN: "0" },
      carteira: (banco, agora) => criarServicoCarteira({ banco, agora, criarConta: fabrica }),
      extras: () => ({ criarContaBinance: fabrica }),
    });
    ana = await api.pessoa("ana.risco@exemplo.com");
    beto = await api.pessoa("beto.risco@exemplo.com");
    roboAna = await criarRobo(ana);
    publicador = new Redis(api.redisUrl);
  });
  afterAll(async () => {
    await publicador.quit();
    await api.encerrar();
  });

  describe("limites da conta", () => {
    it("começa sem limites; apertar não pede nada, afrouxar pede reautenticação", async () => {
      expect((await chamar(ana, "GET", "/risco/limites-conta")).json()).toEqual(LIMITES_CONTA_PADRAO);
      api.relogio.t += CINCO_MIN + 1;
      const apertados = { ...LIMITES_CONTA_PADRAO, perdaDiariaMaxima: "50", orcamentoIaMensalUsd: "20" };
      const r = await chamar(ana, "PUT", "/risco/limites-conta", apertados);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual(apertados);
      const frouxos = { ...apertados, perdaDiariaMaxima: "500" };
      const semReauth = await chamar(ana, "PUT", "/risco/limites-conta", frouxos);
      expect(semReauth.statusCode).toBe(403);
      expect(semReauth.json().erro.codigo).toBe("reautenticacao_necessaria");
      expect((await reautenticar(ana)).statusCode).toBe(204);
      expect((await chamar(ana, "PUT", "/risco/limites-conta", frouxos)).statusCode).toBe(200);
    });

    it("valida o corpo: limite zero ou janela fora da faixa é 400", async () => {
      const r = await chamar(ana, "PUT", "/risco/limites-conta", {
        ...LIMITES_CONTA_PADRAO,
        quedaMaxima: "0",
      });
      expect(r.statusCode).toBe(400);
    });

    it("situação da conta: rede do robô, orçamento de IA e nenhuma pausa", async () => {
      const s = SituacaoContaEsquema.parse((await chamar(ana, "GET", "/risco/conta")).json());
      expect(s.redes.map((r) => r.rede)).toEqual(["testnet"]);
      expect(s.orcamentoIa).toMatchObject({ limiteMensal: "20", uso: 0, esgotado: false });
      expect(s.pausas).toEqual([]);
    });

    it("liberar as pausas exige reautenticação recente", async () => {
      api.relogio.t += CINCO_MIN + 1;
      expect((await chamar(ana, "POST", "/risco/liberar")).statusCode).toBe(403);
      await reautenticar(ana);
      expect((await chamar(ana, "POST", "/risco/liberar")).statusCode).toBe(200);
      const s = SituacaoContaEsquema.parse((await chamar(ana, "GET", "/risco/conta")).json());
      expect(s.liberadaEm).toBe(api.relogio.t);
    });
  });

  describe("reconciliação com a Binance (simulada)", () => {
    it("falta na corretora vira divergência, pausa, aviso e alerta; nada é negociado", async () => {
      await reautenticar(ana);
      const conta = await chamar(ana, "POST", "/contas-corretora", {
        corretora: "binance",
        rede: "testnet",
        apiKey: "chave-de-teste-da-ana",
        apiSecret: "segredo-de-teste-da-ana",
      });
      expect(conta.statusCode).toBe(201);
      await executar(roboAna, "COMPRA", "0.01", "60000");
      binance.saldos = [{ asset: "BTC", free: "0.004", locked: "0.001" }];
      const r = await chamar(ana, "POST", "/risco/reconciliar");
      expect(r.json().conferidas).toEqual([
        { rede: "testnet", ok: true, erro: null, ativos: 1, divergentes: 1 },
      ]);
      const [d] = DivergenciaEsquema.array().parse((await chamar(ana, "GET", "/risco/divergencias")).json());
      expect(d).toMatchObject({ ativo: "BTC", falta: "0.005", estado: "aberta", robos: [{ id: roboAna }] });
      const s = SituacaoContaEsquema.parse((await chamar(ana, "GET", "/risco/conta")).json());
      expect(s.pausas.map((p) => p.codigo)).toEqual(["divergencia_saldo"]);
      expect((await avisosDe(ana)).map((a) => a.tipo)).toContain("divergencia_saldo");
      expect(api.n8n.alertas.map((a) => a.tipo)).toContain("divergencia_saldo");
      expect(binance.chamadas.some((c) => c.includes("/api/v3/order"))).toBe(false);
    });

    it("o bloqueado (stop na corretora) conta como saldo", async () => {
      binance.saldos = [{ asset: "BTC", free: "0", locked: "0.01" }];
      const r = await chamar(ana, "POST", "/risco/reconciliar");
      expect(r.json().conferidas[0].divergentes).toBe(0);
      const [d] = DivergenciaEsquema.array().parse((await chamar(ana, "GET", "/risco/divergencias")).json());
      expect(d).toMatchObject({ estado: "resolvida", resolvidaPor: "conferencia" });
    });

    it("aceitar o saldo da corretora: reautenticação, baixa sem ordem, fecha a divergência", async () => {
      binance.saldos = [{ asset: "BTC", free: "0.006", locked: "0" }];
      await chamar(ana, "POST", "/risco/reconciliar");
      const abertas = DivergenciaEsquema.array()
        .parse((await chamar(ana, "GET", "/risco/divergencias")).json())
        .filter((d) => d.estado === "aberta");
      const id = abertas[0]!.id;
      api.relogio.t += CINCO_MIN + 1;
      expect((await chamar(ana, "POST", `/risco/divergencias/${id}/aceitar`)).statusCode).toBe(403);
      await reautenticar(ana);
      expect((await chamar(beto, "POST", `/risco/divergencias/${id}/aceitar`)).statusCode).toBe(403);
      await reautenticar(beto);
      expect((await chamar(beto, "POST", `/risco/divergencias/${id}/aceitar`)).statusCode).toBe(404);
      const aceita = await chamar(ana, "POST", `/risco/divergencias/${id}/aceitar`);
      expect(aceita.statusCode).toBe(200);
      expect(aceita.json()).toMatchObject({ estado: "aceita", resolvidaPor: "ana.risco@exemplo.com" });
      const posicao = posicaoDe(await api.banco.portas.ordens.execucoes(roboAna));
      expect(posicao.quantidade.toFixed()).toBe("0.006");
      expect(binance.chamadas.some((c) => c.includes("/api/v3/order"))).toBe(false);
      const de_novo = await chamar(ana, "POST", "/risco/reconciliar");
      expect(de_novo.json().conferidas[0].divergentes).toBe(0);
    });
  });

  describe("alertas que chegam pelo canal de eventos", () => {
    const publicar = (e: Evento) => publicador.publish(CANAL_EVENTOS, JSON.stringify(e));

    it("deduplica, grava o aviso da dona e manda ao n8n; marcar como lidos", async () => {
      const antes = api.n8n.alertas.length;
      const alerta = {
        tipo: "robo_nao_ligou" as const,
        gravidade: "critico" as const,
        titulo: "Robô BTC não ligou",
        mensagem: "chave recusada",
        chave: `robo_nao_ligou:${roboAna}`,
        roboId: roboAna,
        em: Date.now(),
      };
      await publicar({ tipo: "alerta", alerta });
      await publicar({ tipo: "alerta", alerta });
      await publicar({
        tipo: "risco",
        roboId: roboAna,
        barreira: { codigo: "perda_diaria", mensagem: "A perda do dia chegou ao limite." },
        em: Date.now(),
      });
      // O canal entrega os eventos em paralelo: a ordem de chegada ao n8n pode variar.
      const chegaram = async () => {
        const tipos = (await avisosDe(ana)).map((a) => a.tipo);
        const ambos = tipos.includes("perda_diaria_robo") && tipos.includes("robo_nao_ligou");
        return ambos && api.n8n.alertas.length - antes >= 2;
      };
      await esperar(chegaram);
      const avisos = await avisosDe(ana);
      expect(avisos.filter((a) => a.tipo === "robo_nao_ligou")).toHaveLength(1);
      expect(
        api.n8n.alertas
          .slice(antes)
          .map((a) => `${a.tipo}:${a.gravidade}`)
          .sort(),
      ).toEqual(["perda_diaria_robo:atencao", "robo_nao_ligou:critico"]);
      const lidos = await chamar(ana, "POST", "/avisos/lidos");
      expect(lidos.json().lidos).toBe(avisos.length);
      expect((await avisosDe(ana)).every((a) => a.lidoEm !== null)).toBe(true);
    });

    it("outra pessoa não vê avisos, divergências nem a conta de quem não é dela", async () => {
      expect(await avisosDe(beto)).toEqual([]);
      expect((await chamar(beto, "GET", "/risco/divergencias")).json()).toEqual([]);
      const s = SituacaoContaEsquema.parse((await chamar(beto, "GET", "/risco/conta")).json());
      expect(s.redes).toEqual([]);
    });
  });

  describe("chave de dinheiro real", () => {
    it("recusa chave com saque; aceita a mesma conta com uma chave sem saque", async () => {
      await reautenticar(ana);
      await api.ativar2fa(ana);
      await reautenticar(ana);
      const real = {
        corretora: "binance",
        rede: "real",
        apiKey: "chave-real-de-teste",
        apiSecret: "segredo-real-de-teste",
      };
      binance.restricoes = { ...binance.restricoes, enableWithdrawals: true };
      const recusada = await chamar(ana, "POST", "/contas-corretora", real);
      expect(recusada.statusCode).toBe(422);
      expect(recusada.json().erro.codigo).toBe("chave_com_saque");
      binance.chaveInvalida = true;
      const ilegivel = await chamar(ana, "POST", "/contas-corretora", real);
      expect(ilegivel.statusCode).toBe(502);
      expect(ilegivel.json().erro.codigo).toBe("chave_nao_conferida");
      binance.chaveInvalida = false;
      binance.restricoes = { ...binance.restricoes, enableWithdrawals: false, ipRestrict: false };
      expect((await chamar(ana, "POST", "/contas-corretora", real)).statusCode).toBe(201);
      const status = (await chamar(ana, "GET", "/binance/status")).json();
      const avisos = status.contas.find((c: { rede: string }) => c.rede === "real").avisos.join(" ");
      expect(avisos).toMatch(/não está presa a um IP/);
    });
  });
});
