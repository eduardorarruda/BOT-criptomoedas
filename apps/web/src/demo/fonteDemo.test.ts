import type { Evento } from "@zentrade/contratos/esquemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoTela } from "../api/fonte";
import { ESTRATEGIAS } from "./dados";
import { criarFonteDemo } from "./fonteDemo";

const AGORA = Date.UTC(2026, 9, 10, 15, 0, 0);

function nova(extra: Parameters<typeof criarFonteDemo>[0] = {}) {
  let t = AGORA;
  const relogio = { avancar: (ms: number) => (t += ms) };
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], agora: () => t, ...extra });
  return { fonte, relogio };
}

async function entrar(fonte: ReturnType<typeof criarFonteDemo>) {
  return fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "123456" });
}

describe("fonte demo: sessão", () => {
  it("pede o código 2FA antes de entrar", async () => {
    const { fonte } = nova();
    await expect(fonte.entrar({ email: "voce@exemplo.com", senha: "x" })).rejects.toMatchObject({
      codigo: "codigo2fa_necessario",
    });
    await expect(
      fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "12" }),
    ).rejects.toMatchObject({
      codigo: "codigo2fa_invalido",
    });
    await expect(fonte.entrar({ email: "sem-arroba", senha: "x" })).rejects.toMatchObject({
      codigo: "credenciais_invalidas",
    });
    await expect(entrar(fonte)).resolves.toMatchObject({ email: "voce@exemplo.com" });
    await expect(fonte.obterSessao()).resolves.not.toBeNull();
  });

  it("lembra a sessão do exemplo ao recarregar e esquece ao sair", async () => {
    const { fonte } = nova();
    await entrar(fonte);
    expect(await nova().fonte.obterSessao()).not.toBeNull();
    await fonte.sair();
    expect(await nova().fonte.obterSessao()).toBeNull();
  });
});

describe("fonte demo: ações críticas", () => {
  it("desligar a parada total pede reautenticação depois de 5 minutos", async () => {
    const { fonte, relogio } = nova();
    await entrar(fonte);
    await expect(fonte.definirParadaTotal(true)).resolves.toBe(true);
    expect((await fonte.resumo()).paradaTotal).toBe(true);
    relogio.avancar(6 * 60_000);
    await expect(fonte.definirParadaTotal(false)).rejects.toMatchObject({
      codigo: "reautenticacao_necessaria",
    });
    await expect(fonte.confirmarIdentidade({ senha: " " })).rejects.toMatchObject({
      codigo: "confirmacao_invalida",
    });
    await fonte.confirmarIdentidade({ codigo2fa: "123456" });
    await expect(fonte.definirParadaTotal(false)).resolves.toBe(false);
  });

  it("cadastrar chave exige reautenticação e chave completa, e nunca devolve o segredo", async () => {
    const { fonte, relogio } = nova();
    await entrar(fonte);
    await expect(
      fonte.criarConta({ corretora: "binance", rede: "testnet", apiKey: "curta", apiSecret: "curto" }),
    ).rejects.toMatchObject({ codigo: "chave_invalida" });
    const conta = await fonte.criarConta({
      corretora: "binance",
      rede: "testnet",
      apiKey: "AAAABBBBCCCCDDDDwxyz",
      apiSecret: "segredo-segredo-segredo",
    });
    expect(conta.apiKeyFinal).toBe("…wxyz");
    expect(JSON.stringify(conta)).not.toContain("segredo");
    relogio.avancar(6 * 60_000);
    await expect(
      fonte.criarConta({
        corretora: "binance",
        rede: "testnet",
        apiKey: "x".repeat(20),
        apiSecret: "y".repeat(20),
      }),
    ).rejects.toMatchObject({ codigo: "reautenticacao_necessaria" });
    await fonte.removerConta(conta.id);
    expect((await fonte.contas()).map((c) => c.id)).not.toContain(conta.id);
  });

  it("ligar o automático com dinheiro real pede reautenticação", async () => {
    const { fonte, relogio } = nova();
    const robo = await fonte.criarRobo({
      nome: "Real",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      rede: "real",
      estrategiaId: "e-rsi",
      estrategiaVersao: 3,
      limites: (await fonte.robos())[0]!.limites,
    });
    expect(robo.modo).toBe("observar");
    relogio.avancar(10 * 60_000);
    await expect(fonte.atualizarRobo(robo.id, { modo: "auto" })).rejects.toMatchObject({
      codigo: "reautenticacao_necessaria",
    });
    await expect(fonte.atualizarRobo(robo.id, { modo: "sugerir" })).resolves.toMatchObject({
      modo: "sugerir",
    });
    await expect(fonte.atualizarRobo("nao-existe", { pausado: true })).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
  });
});

describe("fonte demo: decisões", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aprova a decisão que aguarda e depois a executa com ordem", async () => {
    const { fonte } = nova();
    const eventos: EventoTela[] = [];
    const parar = fonte.tempoReal({ aoEvento: (e) => eventos.push(e), aoEstado: () => undefined });
    const [aguardando] = await fonte.decisoes({ estado: "aguardando_aprovacao" });
    const aprovada = await fonte.aprovarDecisao(aguardando!.id);
    expect(aprovada.estado).toBe("aprovada");
    await expect(fonte.aprovarDecisao(aguardando!.id)).rejects.toMatchObject({ codigo: "conflito" });
    vi.advanceTimersByTime(1300);
    const ordens = eventos.filter((e): e is Extract<Evento, { tipo: "ordem" }> => e.tipo === "ordem");
    expect(ordens.at(-1)?.ordem.decisaoId).toBe(aguardando!.id);
    const [executada] = await fonte.decisoes({ roboId: aguardando!.roboId, limite: 1 });
    expect(executada?.estado).toBe("executada");
    parar();
  });

  it("recusa e avisa quando a decisão não existe", async () => {
    const { fonte } = nova();
    const [aguardando] = await fonte.decisoes({ estado: "aguardando_aprovacao" });
    await expect(fonte.recusarDecisao(aguardando!.id)).resolves.toMatchObject({ estado: "recusada" });
    await expect(fonte.recusarDecisao("x")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("transmite preços e o passo a passo de uma análise até a decisão", () => {
    const { fonte } = nova({ tiqueMs: 1000, primeiraAnaliseMs: 100, analiseCadaMs: 60_000, etapaMs: 10 });
    const eventos: EventoTela[] = [];
    const estados: string[] = [];
    const parar = fonte.tempoReal({ aoEvento: (e) => eventos.push(e), aoEstado: (s) => estados.push(s) });
    vi.advanceTimersByTime(1100);
    const tipos = eventos.map((e) => e.tipo);
    expect(tipos).toContain("preco");
    const fim = eventos.find((e) => e.tipo === "analise" && e.concluida);
    const etapas = eventos.filter((e) => e.tipo === "analise" && e.etapa);
    expect(etapas.length).toBe(5);
    // a mesma sequência do motor: candle → sinal → início da análise → etapas → fim → decisão
    const ordem = eventos.map((e) => e.tipo).filter((t) => t !== "preco");
    expect(ordem.slice(0, 3)).toEqual(["candle", "sinal", "analise"]);
    expect(fim && "resultado" in fim ? fim.resultado : null).toBe("comprar");
    expect(fim).toBeDefined();
    expect(tipos).toContain("decisao");
    parar();
    expect(estados).toEqual(["conectado", "desligado"]);
  });

  it("não analisa nada com a parada total ligada", async () => {
    const { fonte } = nova({ primeiraAnaliseMs: 10, etapaMs: 1, latenciaMs: [0, 0] });
    await entrar(fonte);
    const p = fonte.definirParadaTotal(true);
    await vi.runOnlyPendingTimersAsync();
    await p;
    const eventos: EventoTela[] = [];
    const parar = fonte.tempoReal({ aoEvento: (e) => eventos.push(e), aoEstado: () => undefined });
    vi.advanceTimersByTime(100);
    expect(eventos.filter((e) => e.tipo === "analise")).toHaveLength(0);
    parar();
  });
});

describe("fonte demo: dados", () => {
  it("deriva a posição das execuções e mostra a exposição no resumo", async () => {
    const { fonte } = nova();
    const posicao = await fonte.posicao("r-sol");
    expect(posicao.quantidade).toBe("1.2");
    expect(Number(posicao.taxasPagas)).toBeGreaterThan(0);
    const resumo = await fonte.resumo();
    expect(Number(resumo.exposicao)).toBeGreaterThan(0);
    expect(Number(resumo.maiorQueda30d)).toBeLessThanOrEqual(0);
    expect(resumo.robosAtivos).toBe(3);
    expect(resumo.taxasHoje).toBeDefined();
  });

  it("valida a estratégia antes de gravar e cria versões", async () => {
    const { fonte } = nova();
    const base = ESTRATEGIAS[0]!;
    const { id: _id, versao: _v, ...sem } = base;
    await expect(fonte.criarEstrategia({ ...sem, entrada: { tipo: "e", regras: [] } })).rejects.toMatchObject(
      {
        codigo: "estrategia_invalida",
      },
    );
    const criada = await fonte.criarEstrategia({ ...sem, nome: "Cópia" });
    expect(criada.versao).toBe(1);
    const v2 = await fonte.novaVersaoEstrategia(criada.id, { ...sem, nome: "Cópia", stop: 0.03 });
    expect(v2.versao).toBe(2);
    await expect(fonte.novaVersaoEstrategia("x", sem)).rejects.toMatchObject({ codigo: "nao_encontrado" });
    await expect(fonte.novaVersaoEstrategia(criada.id, { ...sem, stop: 0.9 })).rejects.toMatchObject({
      codigo: "estrategia_invalida",
    });
  });

  it("gera velas que terminam no preço atual e recusa símbolo desconhecido", async () => {
    const { fonte } = nova();
    const velas = await fonte.candles("BTCUSDT", "1h");
    expect(velas).toHaveLength(240);
    await expect(fonte.candles("XYZUSDT", "1h")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("cria token mostrado uma vez, revoga, e cria notas", async () => {
    const { fonte } = nova();
    const t = await fonte.criarToken("CLI", "leitura");
    expect(t.token).toMatch(/^zt_exemplo_/);
    expect((await fonte.tokens()).some((x) => "token" in x)).toBe(false);
    await fonte.revogarToken(t.id);
    expect((await fonte.tokens()).map((x) => x.id)).not.toContain(t.id);
    const nota = await fonte.criarNota({ titulo: "Lembrete", texto: "texto" });
    expect((await fonte.documentos())[0]?.id).toBe(nota.id);
  });

  it("lista ordens por robô, automações, saúde e patrimônio", async () => {
    const { fonte } = nova();
    const comOrdem = (await fonte.decisoes({ roboId: "r-sol" })).filter((d) => d.ordemId).length;
    expect((await fonte.ordens("r-sol")).length).toBe(comOrdem);
    expect(comOrdem).toBeGreaterThan(3); // o diário de exemplo tem semanas de histórico
    expect((await fonte.ordens()).length).toBeGreaterThan(3);
    expect((await fonte.automacoes()).length).toBe(5);
    expect((await fonte.saude()).ok).toBe(true);
    expect((await fonte.patrimonio()).length).toBe(120);
  });
});

describe("fonte demo: backtests", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passa por fila, rodando e concluído", async () => {
    const { fonte } = nova();
    const b = await fonte.criarBacktest({
      estrategiaId: "e-rsi",
      versao: 3,
      simbolo: "BTCUSDT",
      intervalo: "1h",
      inicio: AGORA - 30 * 86_400_000,
      fim: AGORA,
    });
    expect(b.estado).toBe("na_fila");
    vi.advanceTimersByTime(1600);
    expect((await fonte.backtest(b.id)).estado).toBe("rodando");
    vi.advanceTimersByTime(4000);
    const pronto = await fonte.backtest(b.id);
    expect(pronto.estado).toBe("concluido");
    expect(pronto.metricas?.taxasPagas).toBeDefined();
    // O pedido sem configuração ganha os padrões; o resultado vem validado e conta como tentativa.
    expect(pronto.configuracao?.custos).toEqual({ taxaPorLado: 0.001, deslizamentoBps: 5, meioSpreadBps: 2 });
    expect(pronto.validacao?.walkForward?.janelas).toHaveLength(5);
    expect(pronto.curva?.[0]?.buyHold).toBeDefined();
    // Mais duas rodadas da e-rsi concluídas antes desta (a antiga não tem Sharpe, mas conta).
    expect(pronto.tentativas).toMatchObject({ total: 4, daVersao: 2 });
    expect((await fonte.backtests()).length).toBe(5);
    await expect(fonte.backtest("x")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });
});

describe("fonte demo: instalação nova (vazio)", () => {
  it("começa sem nada: listas vazias, resumo zerado e sessão sem 2FA", async () => {
    const { fonte } = nova({ vazio: true });
    const usuario = await entrar(fonte);
    expect(usuario.doisFatores).toBe(false);
    expect(await fonte.estrategias()).toEqual([]);
    expect(await fonte.robos()).toEqual([]);
    expect(await fonte.decisoes()).toEqual([]);
    expect(await fonte.ordens()).toEqual([]);
    expect(await fonte.patrimonio()).toEqual([]);
    expect(await fonte.backtests()).toEqual([]);
    expect(await fonte.documentos()).toEqual([]);
    expect(await fonte.contas()).toEqual([]);
    expect(await fonte.tokens()).toEqual([]);
    expect(await fonte.automacoes()).toEqual([]);
    expect(await fonte.aoVivo()).toEqual([]);
    expect(await fonte.resumo()).toMatchObject({
      resultadoHoje: "0.00",
      exposicao: "0.00",
      robosAtivos: 0,
      taxasHoje: "0.00",
    });
  });
});

describe("fonte demo: 2FA", () => {
  it("gera o segredo, recusa código errado e liga com 6 dígitos", async () => {
    const { fonte } = nova({ vazio: true });
    await entrar(fonte);
    const { segredo, uri } = await fonte.iniciarDoisFatores();
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
    expect(uri).toContain(`secret=${segredo}`);
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    await expect(fonte.ativarDoisFatores("12")).rejects.toMatchObject({ codigo: "codigo_2fa_invalido" });
    await fonte.ativarDoisFatores("123456");
    expect((await fonte.obterSessao())?.doisFatores).toBe(true);
    await expect(fonte.iniciarDoisFatores()).rejects.toMatchObject({ codigo: "2fa_ja_ativo" });
  });

  it("ativar antes de gerar o segredo explica o que falta", async () => {
    const { fonte } = nova({ vazio: true });
    await entrar(fonte);
    await expect(fonte.ativarDoisFatores("123456")).rejects.toMatchObject({ codigo: "2fa_nao_iniciado" });
  });
});
