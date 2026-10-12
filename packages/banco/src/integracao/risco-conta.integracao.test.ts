import { randomUUID } from "node:crypto";
import { LIMITES_CONTA_PADRAO, type RoboDTO } from "@zentrade/contratos";
import { dec, posicaoDe, type Lado } from "@zentrade/dominio";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { avisos, divergenciasSaldo, gastosIa, limitesConta } from "../esquema/index.js";
import { portaRiscoConta } from "../portas/risco-conta.js";
import { LIMITES, montarCenario, type Cenario } from "./ajuda.js";

const HORA = 3_600_000;
const ativoDe = (simbolo: string) => simbolo.replace(/USDT$/, "");

describe("limites da conta, divergências, avisos e gasto de IA", () => {
  let c: Cenario;
  let eth: RoboDTO;
  let papel: RoboDTO;
  beforeAll(async () => {
    c = await montarCenario();
    const base = {
      intervalo: "1h",
      modo: "auto",
      estrategiaId: c.ana.estrategia.id,
      estrategiaVersao: 1,
    } as const;
    eth = await c.banco.robos.criar(c.ana.id, {
      ...base,
      nome: "ETH",
      simbolo: "ETHUSDT",
      rede: "testnet",
      limites: LIMITES,
    });
    papel = await c.banco.robos.criar(c.ana.id, {
      ...base,
      nome: "Papel",
      simbolo: "BTCUSDT",
      rede: "papel",
      limites: LIMITES,
    });
  });
  afterAll(async () => c.encerrar());

  /** Uma ordem executada inteira: decisão, reserva e desfecho, como o motor faz. */
  async function executar(
    roboId: string,
    simbolo: string,
    lado: Lado,
    qtd: string,
    preco: string,
    em: number,
  ) {
    const decisaoId = await c.banco.portas.decisoes.registrar({
      roboId,
      em,
      sinal:
        lado === "COMPRA"
          ? { acao: "COMPRAR", stop: dec(1), alvo: dec(1_000_000), explicacao: "entrada" }
          : { acao: "VENDER", motivo: "stop", explicacao: "stop" },
      preco: dec(preco),
      quantidade: dec(qtd),
      risco: { aprovada: true, barreiras: [] },
      estado: "executada",
    });
    const idCliente = `t-${randomUUID().slice(0, 20)}`;
    await c.banco.portas.ordens.reservar({
      decisaoId,
      roboId,
      idCliente,
      simbolo,
      lado,
      quantidade: dec(qtd),
    });
    await c.banco.portas.ordens.concluir(idCliente, {
      idCliente,
      idCorretora: "1",
      estado: "PREENCHIDA",
      execucoes: [{ lado, preco: dec(preco), quantidade: dec(qtd), taxaCotacao: dec(0), em }],
    });
  }

  describe("limites", () => {
    it("quem nunca configurou recebe o padrão; definir grava e audita", async () => {
      expect(await c.banco.limitesConta.obter(c.ana.id)).toEqual({
        limites: LIMITES_CONTA_PADRAO,
        liberadaEm: null,
      });
      const limites = {
        ...LIMITES_CONTA_PADRAO,
        perdaDiariaMaxima: "100",
        exposicaoMaxima: "250.5",
        posicoesAbertasMax: 1,
        sequenciaStopsMax: 2,
        sequenciaStopsJanelaHoras: 6,
        orcamentoIaMensalUsd: "10",
      };
      const gravados = await c.banco.limitesConta.definir(c.ana.id, limites);
      expect(gravados.limites).toEqual(limites);
      expect((await c.banco.limitesConta.obter(c.ana.id)).limites).toEqual(limites);
      expect((await c.banco.limitesConta.obter(c.beto.id)).limites).toEqual(LIMITES_CONTA_PADRAO);
      const trilha = await c.banco.conexao.sql`select acao from auditoria where usuario_id = ${c.ana.id}`;
      expect(trilha.map((t) => t.acao)).toContain("limites_conta_alterados");
    });

    it("o banco recusa limite zero mesmo que alguém pule a validação da API", async () => {
      await expect(
        c.banco.limitesConta.definir(c.beto.id, { ...LIMITES_CONTA_PADRAO, perdaDiariaMaxima: "0" }),
      ).rejects.toThrow();
    });

    it("liberar grava o instante e não apaga os limites", async () => {
      const r = await c.banco.limitesConta.liberar(c.ana.id, 1_000_000);
      expect(r.liberadaEm).toBe(1_000_000);
      expect(r.limites.perdaDiariaMaxima).toBe("100");
      await c.banco.conexao.sql`update limites_conta set liberada_em = null where usuario_id = ${c.ana.id}`;
    });
  });

  describe("estado da conta para o motor", () => {
    it("soma os robôs da mesma rede, separa o papel e conta as saídas com perda", async () => {
      const agora = Date.now();
      await executar(c.ana.robo.id, "BTCUSDT", "COMPRA", "0.01", "100", agora - 3 * HORA);
      await executar(c.ana.robo.id, "BTCUSDT", "VENDA", "0.01", "90", agora - 2 * HORA); // -0,1
      await executar(eth.id, "ETHUSDT", "COMPRA", "1", "50", agora - HORA);
      await executar(papel.id, "BTCUSDT", "COMPRA", "5", "100", agora - HORA); // papel: outra conta
      await executar(c.beto.robo.id, "BTCUSDT", "COMPRA", "9", "100", agora - HORA); // outra pessoa
      await c.banco.mercado.gravar("ETHUSDT", "1m", [
        {
          abertura: agora - 120_000,
          fechamento: agora - 60_001,
          abre: dec(55),
          maxima: dec(55),
          minima: dec(55),
          fecha: dec(55),
          volume: dec(1),
        },
      ]);
      const porta = portaRiscoConta(c.banco.conexao.db, ativoDe);
      const e = await porta.estado(c.ana.robo.id, agora);
      expect(e.posicoesAbertas).toBe(1);
      expect(e.roboTemPosicao).toBe(false);
      expect(e.exposicao.toFixed()).toBe("55"); // ETH a preço atual
      expect(e.naoRealizado.toFixed()).toBe("5");
      expect(e.saidasComPerdaConta).toHaveLength(1);
      expect(e.saidasComPerdaRobo).toHaveLength(1);
      expect(e.limites.perdaDiariaMaxima?.toFixed()).toBe("100");
      expect(e.limites.sequenciaStopsJanelaMs).toBe(6 * HORA);
      const doEth = await porta.estado(eth.id, agora);
      expect(doEth.roboTemPosicao).toBe(true);
      expect(doEth.saidasComPerdaRobo).toHaveLength(0);
      const doPapel = await porta.estado(papel.id, agora);
      expect(doPapel.exposicao.toFixed()).toBe("500");
      expect(doPapel.saidasComPerdaConta).toHaveLength(0);
    });

    it("robô inexistente é erro (o motor trata como conta indisponível)", async () => {
      await expect(
        portaRiscoConta(c.banco.conexao.db, ativoDe).estado(randomUUID(), Date.now()),
      ).rejects.toThrow(/não existe/);
    });

    it("a situação da tela traz uma fotografia por rede", async () => {
      const s = await c.banco.riscoConta.situacao(c.ana.id, Date.now());
      expect(s.retratos.map((r) => r.rede)).toEqual(["testnet", "papel"]);
      expect(s.orcamento.limiteMensal?.toFixed()).toBe("10");
    });
  });

  describe("divergências", () => {
    const conferencia = (falta: string, divergente = true) => ({
      ativo: "ETH",
      esperado: dec(1),
      naCorretora: dec(1).minus(dec(falta)),
      falta: dec(falta),
      divergente,
    });

    it("abre uma por ativo, atualiza a aberta e resolve quando o saldo volta", async () => {
      const r1 = await c.banco.divergencias.registrar(c.ana.id, "testnet", [conferencia("0.4")], 1_000);
      expect(r1.novas).toHaveLength(1);
      const r2 = await c.banco.divergencias.registrar(c.ana.id, "testnet", [conferencia("0.5")], 2_000);
      expect(r2.novas).toHaveLength(0);
      const [aberta] = await c.banco.divergencias.listar(c.ana.id, 2_000);
      expect(aberta).toMatchObject({ ativo: "ETH", falta: "0.5", estado: "aberta" });
      const e = await portaRiscoConta(c.banco.conexao.db, ativoDe).estado(eth.id, Date.now());
      expect(e.divergencias.map((d) => d.ativo)).toEqual(["ETH"]);
      const r3 = await c.banco.divergencias.registrar(c.ana.id, "testnet", [conferencia("0", false)], 3_000);
      expect(r3.resolvidas).toBe(1);
      expect((await c.banco.divergencias.obter(c.ana.id, aberta!.id))?.resolvidaPor).toBe("conferencia");
    });

    it("aceitar baixa a posição sem ordem na corretora e fecha a divergência", async () => {
      const { novas } = await c.banco.divergencias.registrar(
        c.ana.id,
        "testnet",
        [conferencia("0.25")],
        4_000,
      );
      const id = novas[0]!.id;
      const aceita = await c.banco.divergencias.aceitar(c.ana.id, id, {
        porQuem: "ana@exemplo.com",
        agora: Date.now(),
        ajustes: [{ roboId: eth.id, simbolo: "ETHUSDT", quantidade: dec("0.25"), preco: dec(50) }],
      });
      expect(aceita).toMatchObject({ estado: "aceita", resolvidaPor: "ana@exemplo.com" });
      const posicao = posicaoDe(await c.banco.portas.ordens.execucoes(eth.id));
      expect(posicao.quantidade.toFixed()).toBe("0.75");
      expect(posicao.resultadoRealizado.toFixed()).toBe("0"); // baixa ao preço médio, sem taxa
      await expect(
        c.banco.divergencias.aceitar(c.ana.id, id, { porQuem: "x", agora: 1, ajustes: [] }),
      ).rejects.toMatchObject({ codigo: "estado_invalido" });
    });

    it("alvos traz só contas de testnet e real", async () => {
      const alvos = await c.banco.divergencias.alvos();
      expect(alvos).toEqual(
        expect.arrayContaining([
          { usuarioId: c.ana.id, rede: "testnet" },
          { usuarioId: c.beto.id, rede: "testnet" },
        ]),
      );
      expect(alvos.some((a) => (a.rede as string) === "papel")).toBe(false);
    });
  });

  it("consultas de sistema dos alertas: motivo da venda e o robô", async () => {
    const id = await c.banco.portas.decisoes.registrar({
      roboId: c.ana.robo.id,
      em: Date.now(),
      sinal: { acao: "VENDER", motivo: "stop", explicacao: "stop" },
      preco: dec(1),
      risco: { aprovada: true, barreiras: [] },
      estado: "executada",
    });
    expect(await c.banco.sistema.motivoDaDecisao(id)).toBe("stop");
    expect(await c.banco.sistema.motivoDaDecisao(randomUUID())).toBeNull();
    expect(await c.banco.sistema.descreverRobo(c.ana.robo.id)).toEqual({
      nome: "BTC devagar",
      simbolo: "BTCUSDT",
      usuarioId: c.ana.id,
    });
    expect(await c.banco.sistema.descreverRobo(randomUUID())).toBeNull();
  });

  describe("avisos e gasto de IA", () => {
    it("avisos: grava, lista, conta os enviados e marca como lidos", async () => {
      const agora = Date.now();
      const a = await c.banco.avisos.gravar(c.ana.id, {
        tipo: "robo_nao_ligou",
        gravidade: "critico",
        titulo: "Robô não ligou",
        mensagem: "chave recusada",
        chave: "robo_nao_ligou:x",
        roboId: c.ana.robo.id,
        em: agora,
      });
      await c.banco.avisos.marcarEnviado(c.ana.id, a.id);
      expect(await c.banco.avisos.enviadosDesde(c.ana.id, agora - 1000)).toBe(1);
      expect((await c.banco.avisos.listar(c.ana.id))[0]).toMatchObject({
        id: a.id,
        enviado: true,
        lidoEm: null,
      });
      expect(await c.banco.avisos.marcarLidos(c.ana.id, agora)).toBe(1);
      expect(await c.banco.avisos.marcarLidos(c.ana.id, agora)).toBe(0);
    });

    it("gasto de IA: soma o mês e o dia UTC", async () => {
      const agora = Date.UTC(2026, 9, 12, 15);
      await c.banco.gastosIa.registrar(c.ana.id, "analise", dec("1.5"), Date.UTC(2026, 9, 12, 1));
      await c.banco.gastosIa.registrar(c.ana.id, "assistente", dec("0.25"), Date.UTC(2026, 9, 2));
      await c.banco.gastosIa.registrar(c.ana.id, "analise", dec("9"), Date.UTC(2026, 8, 30)); // mês passado
      const uso = await c.banco.gastosIa.uso(c.ana.id, agora);
      expect(uso.gastoMes.toFixed()).toBe("1.75");
      expect(uso.gastoDia.toFixed()).toBe("1.5");
      expect(uso.limiteMensal?.toFixed()).toBe("10");
      expect(uso.limiteDiario).toBeNull();
    });
  });

  describe("RLS nas tabelas novas", () => {
    it("outra pessoa não lê nenhuma das quatro tabelas, nem sem WHERE", async () => {
      const db = c.banco.conexao.db;
      const doBeto = await comoUsuario(db, c.beto.id, async (tx) => ({
        limites: await tx.select().from(limitesConta),
        divergencias: await tx.select().from(divergenciasSaldo),
        avisos: await tx.select().from(avisos),
        gastos: await tx.select().from(gastosIa),
      }));
      expect(doBeto).toEqual({ limites: [], divergencias: [], avisos: [], gastos: [] });
      expect(await c.banco.avisos.listar(c.beto.id)).toEqual([]);
      expect(await c.banco.divergencias.listar(c.beto.id, Date.now())).toEqual([]);
      expect((await c.banco.gastosIa.uso(c.beto.id, Date.now())).gastoMes.toFixed()).toBe("0");
    });

    it("não deixa gravar em nome de outra pessoa nem mexer no que é dela", async () => {
      const db = c.banco.conexao.db;
      for (const insercao of [
        sql`insert into avisos (usuario_id, tipo, gravidade, titulo, mensagem, chave) values (${c.ana.id}, 'stop_atingido', 'info', 't', 'm', 'k')`,
        sql`insert into gastos_ia (usuario_id, origem, custo_usd) values (${c.ana.id}, 'analise', 1)`,
        sql`insert into limites_conta (usuario_id) values (${c.ana.id})`,
        sql`insert into divergencias_saldo (usuario_id, rede, ativo, esperado, na_corretora, falta) values (${c.ana.id}, 'testnet', 'X', 1, 0, 1)`,
      ])
        await expect(comoUsuario(db, c.beto.id, (tx) => tx.execute(insercao))).rejects.toThrow();
      await comoUsuario(db, c.beto.id, (tx) => tx.execute(sql`update avisos set titulo = 'invadido'`));
      expect((await c.banco.avisos.listar(c.ana.id)).every((a) => a.titulo !== "invadido")).toBe(true);
      const divergencia = await c.banco.divergencias.listar(c.ana.id, Date.now());
      await expect(
        c.banco.divergencias.aceitar(c.beto.id, divergencia[0]!.id, {
          porQuem: "beto",
          agora: 1,
          ajustes: [],
        }),
      ).rejects.toMatchObject({ codigo: "nao_encontrado" });
    });

    it("o livro de gasto não aceita apagar nem reescrever pelo papel da aplicação", async () => {
      const db = c.banco.conexao.db;
      await expect(
        comoUsuario(db, c.ana.id, (tx) => tx.execute(sql`delete from gastos_ia`)),
      ).rejects.toThrow();
      await expect(
        comoUsuario(db, c.ana.id, (tx) => tx.execute(sql`update gastos_ia set custo_usd = 0`)),
      ).rejects.toThrow();
    });
  });
});
