import { randomUUID } from "node:crypto";
import { ConfiguracaoBacktestEsquema } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErroDados } from "../erros.js";
import { ESTRATEGIA, montarCenario, type Cenario } from "./ajuda.js";

const HORA = 3_600_000;

describe("repositórios da API: decisões, ordens, mercado, backtests, conhecimento e resumo", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  const decisao = (em: number, estado: "registrada" | "aguardando_aprovacao" = "aguardando_aprovacao") =>
    c.banco.portas.decisoes.registrar({
      roboId: c.ana.robo.id,
      em,
      sinal: { acao: "COMPRAR", stop: dec("98"), alvo: dec("102"), explicacao: "sinal de teste" },
      preco: dec("100.50"),
      quantidade: dec("0.25"),
      risco: { aprovada: true, barreiras: [] },
      estado,
      custoIaUsd: dec("0.01"),
    });

  it("lista decisões da pessoa, mais recentes primeiro, com filtros e teto", async () => {
    const agora = Date.now();
    const antiga = await decisao(agora - 2 * HORA, "registrada");
    const nova = await decisao(agora - HORA);
    const todas = await c.banco.decisoes.listar(c.ana.id);
    expect(todas.map((d) => d.id)).toEqual([nova, antiga]);
    expect(todas[0]).toMatchObject({ preco: "100.5", quantidade: "0.25", custoIaUsd: "0.01" });
    expect((await c.banco.decisoes.listar(c.ana.id, { estado: "registrada" })).map((d) => d.id)).toEqual([
      antiga,
    ]);
    expect((await c.banco.decisoes.listar(c.ana.id, { antes: agora - HORA })).map((d) => d.id)).toEqual([
      antiga,
    ]);
    expect(await c.banco.decisoes.listar(c.ana.id, { roboId: c.beto.robo.id })).toEqual([]);
    expect(await c.banco.decisoes.listar(c.beto.id)).toEqual([]);
    expect(await c.banco.decisoes.listar(c.ana.id, { limite: 1 })).toHaveLength(1);
  });

  it("aprova uma vez só; a segunda tentativa recebe estado inválido", async () => {
    const id = await decisao(Date.now());
    const aprovada = await c.banco.decisoes.decidir(c.ana.id, id, true, "ana", Date.now());
    expect(aprovada.estado).toBe("aprovada");
    await expect(c.banco.decisoes.decidir(c.ana.id, id, false, "ana", Date.now())).rejects.toMatchObject({
      codigo: "estado_invalido",
    });
  });

  it("aprovação depois do prazo marca a decisão como expirada", async () => {
    const id = await decisao(Date.now());
    const depois = Date.now() + 16 * 60_000;
    await expect(c.banco.decisoes.decidir(c.ana.id, id, true, "ana", depois)).rejects.toMatchObject({
      codigo: "expirada",
    });
    expect((await c.banco.decisoes.obter(c.ana.id, id))!.estado).toBe("expirada");
  });

  it("outra pessoa não decide (a decisão nem existe para ela)", async () => {
    const id = await decisao(Date.now());
    await expect(c.banco.decisoes.decidir(c.beto.id, id, true, "beto", Date.now())).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
  });

  it("o n8n decide como sistema e recebe os dados da proposta", async () => {
    const id = await decisao(Date.now());
    const proposta = await c.banco.decisoes.paraProposta(id);
    expect(proposta).toMatchObject({
      decisaoId: id,
      simbolo: "BTCUSDT",
      acao: "COMPRAR",
      quantidade: "0.25",
    });
    const recusada = await c.banco.decisoes.decidirComoSistema(id, false, "telegram:ana", Date.now());
    expect(recusada.estado).toBe("recusada");
    await expect(
      c.banco.decisoes.decidirComoSistema("00000000-0000-0000-0000-000000000000", true, "x", Date.now()),
    ).rejects.toBeInstanceOf(ErroDados);
    expect(await c.banco.decisoes.paraProposta("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("decisão com ordem traz a ordem e as execuções; ordens filtram por robô", async () => {
    const id = await decisao(Date.now(), "registrada");
    await c.banco.portas.ordens.reservar({
      decisaoId: id,
      roboId: c.ana.robo.id,
      idCliente: "zt-op-1",
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("0.25"),
    });
    await c.banco.portas.ordens.concluir("zt-op-1", {
      idCliente: "zt-op-1",
      idCorretora: "123",
      estado: "PREENCHIDA",
      execucoes: [
        {
          lado: "COMPRA",
          preco: dec("100"),
          quantidade: dec("0.1"),
          taxaCotacao: dec("0.01"),
          em: Date.now(),
        },
        {
          lado: "COMPRA",
          preco: dec("101"),
          quantidade: dec("0.15"),
          taxaCotacao: dec("0.015"),
          em: Date.now(),
        },
      ],
    });
    const detalhe = await c.banco.decisoes.obter(c.ana.id, id);
    expect(detalhe!.ordem).toMatchObject({ idCliente: "zt-op-1", estado: "PREENCHIDA" });
    expect(detalhe!.ordem!.execucoes.map((e) => e.preco)).toEqual(["100", "101"]);
    expect(detalhe!.ordemId).toBe(detalhe!.ordem!.id);
    expect(
      (await c.banco.ordens.listar(c.ana.id, { roboId: c.ana.robo.id })).map((o) => o.idCliente),
    ).toContain("zt-op-1");
    expect(await c.banco.ordens.listar(c.beto.id)).toEqual([]);
    expect(await c.banco.sistema.donoDaOrdem(detalhe!.ordem!.id)).toBe(c.ana.id);
    expect(await c.banco.sistema.donoDaDecisao(id)).toBe(c.ana.id);
    expect(await c.banco.sistema.donoDoRobo(c.beto.robo.id)).toBe(c.beto.id);
    expect(await c.banco.sistema.donoDoRobo("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("resumo do dia: resultado, exposição, custo de IA e parada total", async () => {
    const resumo = await c.banco.resumo.resumo(c.ana.id, Date.now());
    expect(resumo.exposicao).toBe("25.15");
    expect(resumo.resultadoHoje).toBe("-0.025");
    expect(resumo.robosAtivos).toBe(1);
    expect(dec(resumo.custoIaHoje).gt(0)).toBe(true);
    expect(resumo.paradaTotal).toBe(false);
    expect(resumo.taxasHoje).toBe("0.025");
    expect((await c.banco.resumo.resumo(c.beto.id, Date.now())).exposicao).toBe("0");
  });

  it("patrimônio: curva diária do resultado realizado, só da dona", async () => {
    const curva = await c.banco.resumo.patrimonio(c.ana.id, Date.now(), 30);
    // As compras de hoje só pagaram taxa: começa em zero ontem e termina em -0,025 hoje.
    expect(curva.map((p) => p.valor)).toEqual(["0", "-0.025"]);
    expect(curva[1]!.em - curva[0]!.em).toBe(86_400_000);
    expect(await c.banco.resumo.patrimonio(c.beto.id, Date.now(), 30)).toEqual([]);
  });

  it("candles: grava, corrige e lê; 5m sai do agregado contínuo de 1m", async () => {
    const base = Date.UTC(2026, 0, 1, 10, 0);
    const vela = (i: number, fecha: string) => ({
      abertura: base + i * 60_000,
      fechamento: base + (i + 1) * 60_000 - 1,
      abre: dec("100"),
      maxima: dec("110"),
      minima: dec("90"),
      fecha: dec(fecha),
      volume: dec("1.5"),
    });
    await c.banco.mercado.gravar(
      "BTCUSDT",
      "1m",
      [0, 1, 2, 3, 4].map((i) => vela(i, `10${i}`)),
    );
    await c.banco.mercado.gravar("BTCUSDT", "1m", [vela(4, "105")]);
    await c.banco.mercado.gravar("BTCUSDT", "1m", []);
    const consulta = { simbolo: "BTCUSDT", inicio: base, fim: base + 5 * 60_000 };
    const brutos = await c.banco.mercado.candles({ ...consulta, intervalo: "1m" });
    expect(brutos.map((k) => k.fecha)).toEqual(["100", "101", "102", "103", "105"]);
    await c.banco.conexao
      .sql`call refresh_continuous_aggregate('candles_5m', ${new Date(base).toISOString()}::timestamptz, ${new Date(base + 10 * 60_000).toISOString()}::timestamptz)`;
    const agregado = await c.banco.mercado.candles({ ...consulta, intervalo: "5m" });
    expect(agregado).toEqual([
      { abertura: base, abre: "100", maxima: "110", minima: "90", fecha: "105", volume: "7.5" },
    ]);
  });

  it("cobertura dos candles do mini índice: primeiro, último e quantos, por intervalo", async () => {
    const base = Date.UTC(2026, 6, 1, 13, 0);
    const vela = (i: number, ms: number) => ({
      abertura: base + i * ms,
      fechamento: base + (i + 1) * ms - 1,
      abre: dec("128000"),
      maxima: dec("128010"),
      minima: dec("127990"),
      fecha: dec("128005"),
      volume: dec("0"),
    });
    expect(await c.banco.mercado.cobertura(["WIN", "WIN-IBOV"])).toEqual([]);
    await c.banco.mercado.gravar(
      "WIN",
      "5m",
      [0, 1, 2, 3].map((i) => vela(i, 300_000)),
    );
    await c.banco.mercado.gravar("WIN", "15m", [vela(0, 900_000)]);
    await c.banco.mercado.gravar("WIN-IBOV", "5m", [vela(0, 300_000)]);
    expect(await c.banco.mercado.cobertura(["WIN", "WIN-IBOV"])).toEqual([
      { simbolo: "WIN", intervalo: "15m", primeiro: base, ultimo: base, candles: 1 },
      { simbolo: "WIN", intervalo: "5m", primeiro: base, ultimo: base + 900_000, candles: 4 },
      { simbolo: "WIN-IBOV", intervalo: "5m", primeiro: base, ultimo: base, candles: 1 },
    ]);
    expect(await c.banco.mercado.cobertura([])).toEqual([]);
  });

  it("robô não aceita estratégia vendida (o à vista de cripto só compra)", async () => {
    // Uma pessoa só para isto: as outras contas do cenário contam as estratégias que têm.
    const caio = await c.banco.usuarios.criar({ email: "caio@exemplo.com", nome: "caio", senhaHash: "x" });
    const vendida = await c.banco.estrategias.criar(caio.id, {
      ...ESTRATEGIA,
      nome: "Vende no mini índice",
      direcao: "ambos",
      entradaVendida: ESTRATEGIA.entrada,
    });
    const robo = {
      nome: "não pode",
      simbolo: "BTCUSDT",
      intervalo: "1h" as const,
      modo: "observar" as const,
      rede: "papel" as const,
      estrategiaId: vendida.id,
      estrategiaVersao: 1,
      limites: c.ana.robo.limites,
    };
    await expect(c.banco.robos.criar(caio.id, robo)).rejects.toMatchObject({
      codigo: "invalido",
      message: expect.stringMatching(/só compra/),
    });
    expect((await c.banco.estrategias.obter(caio.id, vendida.id))?.estrategia).toMatchObject({
      direcao: "ambos",
    });
  });

  it("candles: 1h sem esperar a materialização; 15m, 4h e 1d agregados a partir de 1m", async () => {
    const base = Date.UTC(2026, 1, 1, 0, 0);
    const minutos = 5 * 60;
    await c.banco.mercado.gravar(
      "ETHUSDT",
      "1m",
      Array.from({ length: minutos }, (_, i) => ({
        abertura: base + i * 60_000,
        fechamento: base + (i + 1) * 60_000 - 1,
        abre: dec(1000 + i),
        maxima: dec(1000 + i + 5),
        minima: dec(1000 + i - 5),
        fecha: dec(1000 + i + 1),
        volume: dec("1.5"),
      })),
    );
    const ler = (intervalo: "15m" | "1h" | "4h" | "1d", horas: number) =>
      c.banco.mercado.candles({ simbolo: "ETHUSDT", intervalo, inicio: base, fim: base + horas * HORA });

    const quinze = await ler("15m", 1);
    expect(quinze.map((k) => k.abertura)).toEqual([0, 1, 2, 3].map((i) => base + i * 15 * 60_000));
    expect(quinze[0]).toMatchObject({
      abre: "1000",
      fecha: "1015",
      maxima: "1019",
      minima: "995",
      volume: "22.5",
    });

    // Nenhum refresh do agregado: a hora mais recente ainda não foi materializada e precisa aparecer.
    expect(await ler("1h", 5)).toHaveLength(5);

    const quatro = await ler("4h", 5);
    expect(quatro.map((k) => k.abertura)).toEqual([base, base + 4 * HORA]);
    expect(await ler("1d", 24)).toEqual([
      { abertura: base, abre: "1000", maxima: "1304", minima: "995", fecha: "1300", volume: "450" },
    ]);
  });

  it("backtest nasce na fila e o motor conclui ou falha", async () => {
    const pedido = {
      estrategiaId: c.ana.estrategia.id,
      versao: 1,
      simbolo: "BTCUSDT",
      intervalo: "1h" as const,
      inicio: Date.UTC(2026, 0, 1),
      fim: Date.UTC(2026, 1, 1),
    };
    const { id, estado } = await c.banco.backtests.criar(c.ana.id, pedido);
    expect(estado).toBe("na_fila");
    expect((await c.banco.backtests.iniciar(id))!.estado).toBe("rodando");
    await c.banco.backtests.concluir(id, { metricas: { retorno: "0.1" }, curva: [] });
    // Métricas fora do contrato não saem: o erro explica.
    expect(await c.banco.backtests.obter(c.ana.id, id)).toMatchObject({
      estado: "concluido",
      versao: 1,
      metricas: null,
      curva: [],
      erro: expect.stringMatching(/fora do contrato/),
    });
    const metricas = {
      resultadoLiquido: "-1.5",
      maiorQueda: "3",
      maiorQuedaPercentual: 0.003,
      operacoes: 2,
      acertos: 1,
      taxaAcerto: 0.5,
      taxasPagas: "0.4",
    };
    await c.banco.backtests.concluir(id, { metricas, curva: [{ em: 1, patrimonio: "1000" }] });
    expect(await c.banco.backtests.obter(c.ana.id, id)).toMatchObject({ metricas, erro: null });
    expect((await c.banco.backtests.listar(c.ana.id)).map((b) => b.id)).toEqual([id]);
    expect(await c.banco.backtests.listar(c.beto.id)).toEqual([]);
    expect(await c.banco.backtests.obter(c.beto.id, id)).toBeNull();
    await expect(c.banco.backtests.criar(c.beto.id, pedido)).rejects.toMatchObject({ codigo: "invalido" });
    await expect(c.banco.backtests.criar(c.ana.id, { ...pedido, fim: pedido.inicio })).rejects.toMatchObject({
      codigo: "invalido",
    });
    const outro = await c.banco.backtests.criar(c.ana.id, pedido);
    await c.banco.backtests.falhar(outro.id, "sem candles");
    expect(await c.banco.backtests.obter(c.ana.id, outro.id)).toMatchObject({
      estado: "falhou",
      erro: "sem candles",
    });
    expect(await c.banco.backtests.iniciar("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("backtest guarda a configuração e a validação; tentativas por estratégia sob RLS", async () => {
    const configuracao = ConfiguracaoBacktestEsquema.parse({ risco: { modo: "sem_limites" } });
    const pedido = {
      estrategiaId: c.ana.estrategia.id,
      versao: 1,
      simbolo: "ETHUSDT",
      intervalo: "4h" as const,
      inicio: Date.UTC(2026, 0, 1),
      fim: Date.UTC(2026, 2, 1),
      configuracao,
    };
    const antes = await c.banco.backtests.tentativas(c.ana.id, [c.ana.estrategia.id]);
    const { id } = await c.banco.backtests.criar(c.ana.id, pedido);
    expect(await c.banco.backtests.obter(c.ana.id, id)).toMatchObject({ configuracao, validacao: null });
    expect((await c.banco.backtests.paraRodar(id))?.configuracao).toEqual(configuracao);
    const metricas = {
      resultadoLiquido: "12",
      maiorQueda: "3",
      maiorQuedaPercentual: 0.003,
      operacoes: 2,
      acertos: 1,
      taxaAcerto: 0.5,
      taxasPagas: "0.4",
      sharpe: 1.25,
    };
    const validacao = { amostra: null, walkForward: null, monteCarlo: null, avisos: [] };
    await c.banco.backtests.concluir(id, { metricas, curva: [], validacao });
    expect(await c.banco.backtests.obter(c.ana.id, id)).toMatchObject({ metricas, validacao, erro: null });
    const depois = await c.banco.backtests.tentativas(c.ana.id, [c.ana.estrategia.id]);
    expect(depois).toHaveLength(antes.length + 1);
    expect(depois.at(-1)).toMatchObject({ id, versao: 1, sharpe: 1.25, estrategiaId: c.ana.estrategia.id });
    expect(await c.banco.backtests.tentativas(c.beto.id, [c.ana.estrategia.id])).toEqual([]);
    expect(await c.banco.backtests.tentativas(c.ana.id, [])).toEqual([]);
    // Validação fora do contrato não sai: o erro explica, como nas métricas.
    await c.banco.backtests.concluir(id, { metricas, curva: [], validacao: { avisos: "x" } });
    expect(await c.banco.backtests.obter(c.ana.id, id)).toMatchObject({
      validacao: null,
      erro: expect.stringMatching(/fora do contrato/),
    });
  });

  it("conhecimento: grava documento com trechos sob RLS e não duplica conteúdo repetido", async () => {
    const embedding = Array.from({ length: 1024 }, (_, i) => (i % 7) / 7);
    const doc = {
      id: randomUUID(),
      usuarioId: c.ana.id,
      fonte: "nota" as const,
      titulo: "Por que não opero em fim de semana",
      url: null,
      publicadoEm: new Date(),
      hashConteudo: "h".repeat(64),
    };
    const trechos = [{ id: randomUUID(), ordem: 0, texto: "Liquidez baixa no sábado.", embedding }];
    const primeiro = await c.banco.conhecimento.gravarDocumento(doc, trechos);
    const repetido = await c.banco.conhecimento.gravarDocumento({ ...doc, id: randomUUID() }, trechos);
    expect(primeiro).toEqual({ documentoId: doc.id, novo: true });
    expect(repetido).toEqual({ documentoId: doc.id, novo: false });
    expect(await c.banco.conhecimento.documentoPorHash(c.ana.id, doc.hashConteudo)).toBe(doc.id);
    expect(await c.banco.conhecimento.documentoPorHash(c.beto.id, doc.hashConteudo)).toBeNull();
    expect(await c.banco.conhecimento.obter(c.ana.id, doc.id)).toMatchObject({
      titulo: doc.titulo,
      url: null,
    });
    expect(await c.banco.conhecimento.obter(c.beto.id, doc.id)).toBeNull();
    expect((await c.banco.conhecimento.listar(c.ana.id)).map((d) => d.titulo)).toEqual([doc.titulo]);
    expect(await c.banco.conhecimento.listar(c.beto.id)).toEqual([]);
    const outro = { ...doc, id: randomUUID(), hashConteudo: "i".repeat(64) };
    await expect(
      c.banco.conhecimento.gravarDocumento(outro, [{ ...trechos[0]!, embedding: [1, 2] }]),
    ).rejects.toThrow(/1024 dimensões/);
    await expect(c.banco.conhecimento.gravarDocumento(outro, [])).rejects.toThrow(/trecho/);
  });

  it("estratégias: lista a versão atual, recusa regra inválida e versão de estratégia alheia", async () => {
    expect((await c.banco.estrategias.listar(c.ana.id)).map((e) => e.id)).toEqual([c.ana.estrategia.id]);
    await expect(c.banco.estrategias.criar(c.ana.id, { ...ESTRATEGIA, stop: 0.9 })).rejects.toMatchObject({
      codigo: "invalido",
    });
    await expect(
      c.banco.estrategias.criar(c.ana.id, {
        ...ESTRATEGIA,
        entrada: { tipo: "e", regras: [] },
      }),
    ).rejects.toThrow(/pelo menos uma condição/);
    await expect(
      c.banco.estrategias.novaVersao(c.beto.id, c.ana.estrategia.id, ESTRATEGIA),
    ).rejects.toMatchObject({ codigo: "nao_encontrado" });
    expect(await c.banco.estrategias.versao(c.ana.id, c.ana.estrategia.id, 1)).toMatchObject({ versao: 1 });
    expect(await c.banco.estrategias.versao(c.beto.id, c.ana.estrategia.id, 1)).toBeNull();
  });

  it("robôs: atualização parcial, nada a mudar e robô alheio", async () => {
    const mudado = await c.banco.robos.atualizar(c.ana.id, c.ana.robo.id, {
      nome: "Novo nome",
      modo: "sugerir",
      limites: { ...c.ana.robo.limites, exposicaoMaxima: "2000" },
    });
    expect(mudado).toMatchObject({
      nome: "Novo nome",
      modo: "sugerir",
      limites: { exposicaoMaxima: "2000" },
    });
    expect((await c.banco.robos.atualizar(c.ana.id, c.ana.robo.id, {}))!.nome).toBe("Novo nome");
    expect(await c.banco.robos.atualizar(c.beto.id, c.ana.robo.id, { nome: "x" })).toBeNull();
    expect(await c.banco.robos.contarAtivos(c.ana.id)).toBe(1);
    expect(await c.banco.robos.contarPausados()).toBe(0);
  });

  it("usuários e sessões: primeira pessoa, hash da senha e limpeza de sessões vencidas", async () => {
    expect((await c.banco.usuarios.primeiro())!.id).toBe(c.ana.id);
    expect(await c.banco.usuarios.senhaHash(c.ana.id)).toBe("x");
    expect(await c.banco.usuarios.segredo2fa(c.ana.id)).toBeNull();
    await c.banco.sessoes.criar({ id: "velha", usuarioId: c.ana.id, csrf: "c", expiraEm: Date.now() - 1 });
    expect(await c.banco.sessoes.removerExpiradas(Date.now())).toBeGreaterThanOrEqual(1);
    await expect(c.banco.sistema.ping()).resolves.toBeUndefined();
  });
});
