import { PropostaCriadaEsquema, RespostaAprovacaoEsquema } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { chavesDoCorpo, lerContrato } from "./contrato.js";
import { carregarFluxo, codigoDo } from "./fluxos.js";
import { executarCodigo, type Item } from "./sandbox.js";

/** Comportamento dos nós Code de cada fluxo, rodando o mesmo código que vai para o n8n. */
const AGORA = Date.parse("2026-10-10T23:30:00Z"); // 20h30 em Brasília
const MIN = 60_000;
const json = (itens: Item[], i = 0): Record<string, unknown> => (itens[i] as Item).json;

describe("zentrade-aprovacao", () => {
  const fluxo = carregarFluxo("zentrade-aprovacao");
  const ler = (dados: unknown, estado: Record<string, unknown> = {}) =>
    executarCodigo(codigoDo(fluxo, "Ler proposta"), {
      entrada: [{ json: { dados } }],
      agoraMs: AGORA,
      estado,
    });
  const proposta = {
    decisaoId: "dec_1",
    roboId: "robo_btc",
    simbolo: "BTCUSDT",
    acao: "COMPRAR",
    quantidade: "0.001",
    preco: "62000.5",
    resumo: "RSI <30> & *forte* com `média` [subindo] e 'aspas'",
    expiraEm: AGORA + 4 * MIN,
  };

  const AMOSTRAS: readonly unknown[] = [
    proposta,
    { ...proposta, acao: "VENDER", resumo: "" },
    { ...proposta, acao: "SEGURAR" },
    { ...proposta, decisaoId: "" },
    { ...proposta, decisaoId: "x".repeat(65) },
    { ...proposta, resumo: "x".repeat(1001) },
    { ...proposta, expiraEm: -1 },
    { ...proposta, expiraEm: 1.5 },
    { ...proposta, quantidade: 1 },
    { ...proposta, simbolo: undefined },
    [],
    null,
    "texto",
  ];

  it.each(AMOSTRAS.map((a, i) => [i, a] as const))(
    "aceita e recusa como PropostaCriadaEsquema (amostra %i)",
    async (_i, amostra) => {
      const r = await ler(amostra);
      expect(json(r).ok).toBe(PropostaCriadaEsquema.safeParse(amostra).success);
    },
  );

  it("espera no máximo 5 minutos, ou menos se a decisão expirar antes", async () => {
    expect(json(await ler(proposta)).limiteEspera).toBe(new Date(AGORA + 4 * MIN).toISOString());
    const longa = await ler({ ...proposta, decisaoId: "d2", expiraEm: AGORA + 30 * MIN });
    expect(json(longa).limiteEspera).toBe(new Date(AGORA + 5 * MIN).toISOString());
  });

  it("não pede aprovação de proposta prestes a expirar nem repetida", async () => {
    expect(json(await ler({ ...proposta, expiraEm: AGORA + 5000 })).aindaVale).toBe(false);
    const estado = {};
    expect(json(await ler(proposta, estado)).duplicada).toBe(false);
    expect(json(await ler(proposta, estado)).duplicada).toBe(true);
  });

  it("protege a mensagem do Markdown forçado pelo Telegram e do escape de HTML do n8n", async () => {
    const mensagem = String(json(await ler(proposta)).mensagem);
    expect(mensagem).toContain("robo\\_btc");
    expect(mensagem).toContain("\\*forte\\*");
    expect(mensagem).toContain("\\`média\\`");
    expect(mensagem).toContain("\\[subindo]");
    expect(mensagem).not.toMatch(/[<>&'"]/);
    expect(mensagem).toContain("Comprar 0.001 BTCUSDT");
    expect(mensagem).toContain("20:34"); // limite em horário de Brasília
  });

  const montar = (entrada: Record<string, unknown>, agoraMs = AGORA) =>
    executarCodigo(codigoDo(fluxo, "Montar resposta"), {
      entrada: [{ json: entrada }],
      nos: { "Ler proposta": [{ json: { proposta } }] },
      agoraMs,
    });

  it("transforma o clique em RespostaAprovacao válida", async () => {
    const [item] = await montar({ data: { approved: false, responder: { id: "42", name: "Ana" } } });
    const corpo = JSON.parse(String(item?.json.corpo)) as unknown;
    expect(RespostaAprovacaoEsquema.parse(corpo)).toEqual({
      decisaoId: "dec_1",
      aprovada: false,
      porQuem: "telegram:Ana",
    });
  });

  it("limita porQuem a 80 caracteres", async () => {
    const [item] = await montar({
      data: { approved: true, responder: { id: "1", username: "u".repeat(200) } },
    });
    const corpo = RespostaAprovacaoEsquema.parse(JSON.parse(String(item?.json.corpo)));
    expect(corpo.porQuem).toHaveLength(80);
  });

  it("sem clique (tempo esgotado) ou depois do prazo, não envia nada", async () => {
    expect(await montar({ ...proposta })).toEqual([]);
    expect(await montar({ data: { approved: true } }, proposta.expiraEm)).toEqual([]);
  });
});

describe("zentrade-alertas", () => {
  const fluxo = carregarFluxo("zentrade-alertas");
  const ler = (dados: unknown, estado: Record<string, unknown> = {}, agoraMs = AGORA) =>
    executarCodigo(codigoDo(fluxo, "Ler alerta"), { entrada: [{ json: { dados } }], agoraMs, estado });

  it("monta o texto e escapa o HTML para o Telegram", async () => {
    const r = json(await ler({ tipo: "risco", titulo: "Perda <diária>", mensagem: "A & B", em: AGORA }));
    expect(r.ok).toBe(true);
    expect(r.assunto).toBe("[ZenTrade] Perda <diária>");
    expect(r.textoTelegram).toContain("Perda &lt;diária&gt;");
    expect(r.textoTelegram).toContain("A &amp; B");
    expect(r.texto).toContain("A & B");
  });

  it("recusa alerta sem os campos do contrato", async () => {
    const r = json(await ler({ tipo: "risco", titulo: "", mensagem: "x", em: AGORA }));
    expect(r).toEqual({ ok: false, motivo: "campos inválidos: titulo" });
  });

  it("corta mensagens maiores que o limite do Telegram", async () => {
    const r = json(await ler({ tipo: "x", titulo: "t", mensagem: "a".repeat(4000), em: AGORA }));
    expect(String(r.texto).length).toBeLessThanOrEqual(4000);
  });

  const alerta = {
    tipo: "robo_nao_ligou",
    titulo: "Robô BTC não ligou",
    mensagem: "chave recusada",
    em: AGORA,
    gravidade: "critico",
    chave: "robo_nao_ligou:r1",
  };

  it("marca a gravidade no título; info não ganha marca", async () => {
    expect(json(await ler(alerta)).assunto).toBe("[ZenTrade] [CRÍTICO] Robô BTC não ligou");
    expect(json(await ler({ ...alerta, gravidade: "atencao" })).assunto).toBe(
      "[ZenTrade] [ATENÇÃO] Robô BTC não ligou",
    );
    expect(json(await ler({ ...alerta, gravidade: "info" })).assunto).toBe("[ZenTrade] Robô BTC não ligou");
    expect(json(await ler({ ...alerta, gravidade: "grave", chave: "" }))).toEqual({
      ok: false,
      motivo: "campos inválidos: gravidade, chave",
    });
  });

  it("o mesmo fato (chave) em 10 min não manda segunda mensagem; sem chave, sempre manda", async () => {
    const estado = {};
    expect(json(await ler(alerta, estado)).duplicado).toBe(false);
    expect(json(await ler(alerta, estado, AGORA + 9 * MIN)).duplicado).toBe(true);
    expect(json(await ler(alerta, estado, AGORA + 21 * MIN)).duplicado).toBe(false);
    const { chave: _sem, ...semChave } = alerta;
    expect(json(await ler(semChave, estado)).duplicado).toBe(false);
    expect(json(await ler(semChave, estado)).duplicado).toBe(false);
  });

  it("o alerta repetido para antes do Telegram e do e-mail", () => {
    expect(fluxo.connections["Aceitar (202)"]?.main?.[0]?.map((l) => l.node)).toEqual(["Alerta novo?"]);
    expect(fluxo.connections["Alerta novo?"]?.main?.[0]?.map((l) => l.node)).toEqual([
      "Avisar no Telegram",
      "E-mail configurado?",
    ]);
    expect(fluxo.connections["Alerta novo?"]?.main?.[1] ?? []).toEqual([]);
  });
});

describe("zentrade-noticias", () => {
  const fluxo = carregarFluxo("zentrade-noticias");
  const contrato = lerContrato();

  it("lê as fontes padrão e acrescenta só URLs https das variáveis", async () => {
    const r = await executarCodigo(codigoDo(fluxo, "Fontes"), {
      nos: {
        Configuração: [
          {
            json: { feedsExtras: "https://www.exemplo.com/rss, http://inseguro.com/rss javascript:alert(1)" },
          },
        ],
      },
      agoraMs: AGORA,
    });
    expect(r.map((i) => i.json.url)).toEqual([
      "https://cointelegraph.com/rss",
      "https://decrypt.co/feed",
      "https://www.exemplo.com/rss",
    ]);
    expect(json(r, 2).nome).toBe("exemplo.com");
  });

  const binance = {
    json: {
      data: {
        catalogs: [
          {
            catalogName: "New Cryptocurrency Listing",
            articles: [
              { code: "a".repeat(32), title: "Binance Will List ABC", releaseDate: AGORA - 60 * MIN },
              { code: "b".repeat(32), title: "Antigo", releaseDate: AGORA - 72 * 60 * MIN },
              { code: "../../evil", title: "Código inválido", releaseDate: AGORA },
            ],
          },
        ],
      },
    },
  };
  const materiaLonga = `<p>${"Parágrafo da matéria. ".repeat(400)}</p>`;
  const rss = [
    {
      json: {
        title: "Bitcoin <b>sobe</b> &amp; ETH cai",
        link: "https://exemplo.com/materia",
        isoDate: new Date(AGORA - 10 * MIN).toISOString(),
        content: materiaLonga,
      },
    },
    {
      json: {
        title: "Já enviada",
        link: "https://exemplo.com/velha",
        isoDate: new Date(AGORA - MIN).toISOString(),
      },
    },
    { json: { error: { message: "feed fora do ar" } } },
    { json: { title: "Sem link", isoDate: new Date(AGORA).toISOString() } },
  ];
  const resumir = () =>
    executarCodigo(codigoDo(fluxo, "Resumir e filtrar"), {
      entrada: rss,
      nos: { "Anúncios da Binance": [binance] },
      agoraMs: AGORA,
      estado: { noticiasEnviadas: { "https://exemplo.com/velha": AGORA - 5 * MIN } },
    });

  it("descarta o velho, o já enviado, o inválido e o que falhou", async () => {
    const corpos = (await resumir()).map((i) => JSON.parse(String(i.json.corpo)) as Record<string, unknown>);
    expect(corpos.map((c) => c.url)).toEqual([
      "https://exemplo.com/materia",
      `https://www.binance.com/pt-BR/support/announcement/detail/${"a".repeat(32)}`,
    ]);
  });

  it("manda resumo curto com link, nunca a matéria inteira", async () => {
    const [materia] = (await resumir()).map(
      (i) => JSON.parse(String(i.json.corpo)) as Record<string, string>,
    );
    expect(materia?.titulo).toBe("Bitcoin sobe & ETH cai");
    expect(materia?.texto).toContain("Matéria completa: https://exemplo.com/materia");
    expect(String(materia?.texto).length).toBeLessThan(450);
    expect(materia?.texto).not.toContain("<p>");
  });

  it("o corpo tem exatamente os campos documentados para /webhooks/n8n/conhecimento", async () => {
    const { obrigatorias, opcionais } = chavesDoCorpo(
      contrato.corposWebhooks["/webhooks/n8n/conhecimento"] ?? "",
    );
    for (const item of await resumir()) {
      const corpo = JSON.parse(String(item.json.corpo)) as Record<string, unknown>;
      for (const chave of obrigatorias) expect(corpo).toHaveProperty(chave);
      for (const chave of Object.keys(corpo)) expect([...obrigatorias, ...opcionais]).toContain(chave);
      expect(corpo.fonte).toBe("noticia");
      expect(Number.isSafeInteger(corpo.publicadoEm)).toBe(true);
    }
  });

  it("lembra só o que a API aceitou", async () => {
    const estado: Record<string, unknown> = {};
    const pedidos = [{ json: { chave: "https://a" } }, { json: { chave: "https://b" } }];
    const r = await executarCodigo(codigoDo(fluxo, "Registrar enviados"), {
      entrada: [{ json: {} }, { json: { error: { message: "500" } } }],
      nos: { "Resumir e filtrar": pedidos },
      agoraMs: AGORA,
      estado,
    });
    expect(json(r)).toEqual({ aceitas: 1, falhas: 1 });
    expect(Object.keys(estado.noticiasEnviadas as object)).toEqual(["https://a"]);
  });
});

describe("zentrade-relatorio-diario", () => {
  const fluxo = carregarFluxo("zentrade-relatorio-diario");
  const ONTEM = AGORA - 24 * 60 * MIN;
  const montar = (ordens: Item[], decisoes: Item[], resumo: Item[]) =>
    executarCodigo(codigoDo(fluxo, "Montar relatório"), {
      entrada: ordens,
      nos: { "Buscar resumo": resumo, "Buscar decisões": decisoes },
      agoraMs: AGORA,
    });
  const resumo = [
    {
      json: {
        resultadoHoje: "-12.5",
        exposicao: "100",
        maiorQueda30d: "3.2",
        robosAtivos: 2,
        custoIaHoje: "0.0123",
        paradaTotal: true,
      },
    },
  ];
  const ordem = (execucoes: { taxaCotacao: string; em: number }[]) => ({ json: { id: "o", execucoes } });

  it("soma taxas em decimal exato (0,1 + 0,2 = 0,3) e só as de hoje", async () => {
    const r = json(
      await montar(
        [
          ordem([
            { taxaCotacao: "0.1", em: AGORA - MIN },
            { taxaCotacao: "0.2", em: AGORA - MIN },
            { taxaCotacao: "5", em: ONTEM },
          ]),
        ],
        [{ json: {} }],
        resumo,
      ),
    );
    expect(r.taxasHoje).toBe("0.3");
  });

  it("não perde precisão com valores grandes e muitas casas", async () => {
    const r = json(
      await montar(
        [
          ordem([
            { taxaCotacao: "12345678901234567890.123456789", em: AGORA },
            { taxaCotacao: "0.000000001", em: AGORA },
            { taxaCotacao: "-0.5", em: AGORA },
          ]),
        ],
        [],
        resumo,
      ),
    );
    expect(r.taxasHoje).toBe("12345678901234567889.623456790");
  });

  it("conta as decisões do dia por estado e mostra o essencial", async () => {
    const decisoes = [
      { json: { id: "1", em: AGORA - MIN, estado: "executada", risco: { barreiras: [] } } },
      {
        json: {
          id: "2",
          em: AGORA - 2 * MIN,
          estado: "barrada",
          risco: { barreiras: [{ codigo: "perda_diaria" }] },
        },
      },
      { json: { id: "3", em: ONTEM, estado: "executada", risco: { barreiras: [] } } },
    ];
    const r = json(await montar([], decisoes, resumo));
    const texto = String(r.texto);
    expect(r.decisoesHoje).toBe(2);
    expect(texto).toContain("relatório de 10/10/2026");
    expect(texto).toContain("Resultado do dia: US$ -12,50");
    expect(texto).toContain("Custo de IA hoje: US$ 0,0123");
    expect(texto).toContain("parada total está LIGADA");
    expect(texto).toContain("executadas: 1");
    expect(texto).toContain("perda_diaria (1)");
  });

  it("avisa quando a API não respondeu, em vez de inventar números", async () => {
    const erro = [{ json: { error: { message: "connect ECONNREFUSED <api>" } } }];
    const texto = String(json(await montar(erro, erro, erro)).texto);
    expect(texto).toContain("Não consegui buscar o resumo: connect ECONNREFUSED &lt;api&gt;");
    expect(texto).toContain("Taxas pagas hoje: indisponível");
    expect(texto).toContain("Não consegui buscar as decisões");
  });
});

describe("zentrade-vigia-saude", () => {
  const fluxo = carregarFluxo("zentrade-vigia-saude");
  const avaliar = (resposta: Record<string, unknown>, estado: Record<string, unknown>, agoraMs = AGORA) =>
    executarCodigo(codigoDo(fluxo, "Avaliar saúde"), { entrada: [{ json: resposta }], agoraMs, estado });

  it("motor vivo: não faz nada", async () => {
    expect(await avaliar({ motorVivoHaSegundos: 180, robosPausados: 0 }, {})).toEqual([]);
  });

  it("motor parado há mais de 3 min: liga a parada total uma vez e repete o aviso a cada 30 min", async () => {
    const estado = {};
    const primeiro = json(await avaliar({ motorVivoHaSegundos: 181, robosPausados: 0 }, estado));
    expect(primeiro.ligarParada).toBe(true);
    expect(await avaliar({ motorVivoHaSegundos: 240 }, estado, AGORA + MIN)).toEqual([]);
    const lembrete = json(await avaliar({ motorVivoHaSegundos: 2000 }, estado, AGORA + 31 * MIN));
    expect(lembrete.ligarParada).toBe(false);
    expect(lembrete.texto).toContain("continua sem dar sinal");
  });

  it("motor que nunca deu sinal conta como parado", async () => {
    expect(json(await avaliar({ motorVivoHaSegundos: null }, {})).ligarParada).toBe(true);
  });

  it("quando o motor volta, avisa e lembra que a parada total segue ligada", async () => {
    const estado = {};
    await avaliar({ motorVivoHaSegundos: 999 }, estado);
    const volta = json(await avaliar({ motorVivoHaSegundos: 5 }, estado, AGORA + 2 * MIN));
    expect(volta.ligarParada).toBe(false);
    expect(volta.texto).toContain("parada total continua ligada");
  });

  it("API fora do ar: avisa, mas não tenta ligar a parada por ela", async () => {
    const r = json(await avaliar({ error: { message: "timeout" } }, {}));
    expect(r.ligarParada).toBe(false);
    expect(r.texto).toContain("API não respondeu");
  });

  it("confirma no aviso se a parada total foi ligada ou não", async () => {
    const nos = { "Avaliar saúde": [{ json: { texto: "ALERTA" } }] };
    const ok = await executarCodigo(codigoDo(fluxo, "Confirmar parada"), {
      entrada: [{ json: { ligada: true } }],
      nos,
      agoraMs: AGORA,
    });
    expect(json(ok).texto).toContain("Liguei a parada total");
    const falhou = await executarCodigo(codigoDo(fluxo, "Confirmar parada"), {
      entrada: [{ json: { error: { message: "403 <sem escopo>" } } }],
      nos,
      agoraMs: AGORA,
    });
    expect(json(falhou).texto).toContain("NÃO consegui ligar a parada total (403 &lt;sem escopo&gt;)");
  });
});

describe("zentrade-revalidacao-semanal", () => {
  const fluxo = carregarFluxo("zentrade-revalidacao-semanal");
  const robo = (id: string, extra: Record<string, unknown> = {}) => ({
    json: {
      id,
      nome: `Robô ${id}`,
      simbolo: "BTCUSDT",
      intervalo: "1h",
      estrategiaId: "media-rsi",
      estrategiaVersao: 3,
      pausado: false,
      ...extra,
    },
  });

  it("agrupa robôs ativos por estratégia e planeja janela recente e base", async () => {
    const r = await executarCodigo(codigoDo(fluxo, "Planejar backtests"), {
      entrada: [robo("a"), robo("b"), robo("c", { pausado: true }), robo("d", { simbolo: "ETHUSDT" })],
      agoraMs: AGORA,
    });
    expect(r).toHaveLength(4);
    const dia = Math.floor(AGORA / 86_400_000) * 86_400_000;
    expect(json(r, 0)).toMatchObject({
      janela: "recente",
      robos: ["Robô a", "Robô b"],
      corpoBacktest: {
        estrategiaId: "media-rsi",
        versao: 3,
        simbolo: "BTCUSDT",
        intervalo: "1h",
        inicio: dia - 30 * 86_400_000,
        fim: dia,
      },
    });
    expect(json(r, 1)).toMatchObject({ janela: "base", corpoBacktest: { fim: dia - 30 * 86_400_000 } });
  });

  it("sem robô ativo ou com erro na API, avisa em vez de disparar", async () => {
    const vazio = await executarCodigo(codigoDo(fluxo, "Planejar backtests"), {
      entrada: [{ json: {} }],
      agoraMs: AGORA,
    });
    expect(json(vazio)).toMatchObject({ semBacktests: true });
    const erro = await executarCodigo(codigoDo(fluxo, "Planejar backtests"), {
      entrada: [{ json: { error: { message: "401" } } }],
      agoraMs: AGORA,
    });
    expect(json(erro).motivo).toContain("401");
  });

  it("compara as janelas e alerta quando o recente fica abaixo do histórico", async () => {
    const planos = [
      {
        json: {
          chave: "media-rsi@3|BTCUSDT|1h",
          janela: "recente",
          robos: ["A"],
          backtestId: "b1",
          erroDisparo: null,
        },
      },
      {
        json: {
          chave: "media-rsi@3|BTCUSDT|1h",
          janela: "base",
          robos: ["A"],
          backtestId: "b2",
          erroDisparo: null,
        },
      },
      {
        json: {
          chave: "x@1|ETHUSDT|4h",
          janela: "recente",
          robos: ["B"],
          backtestId: null,
          erroDisparo: "403",
        },
      },
      {
        json: { chave: "x@1|ETHUSDT|4h", janela: "base", robos: ["B"], backtestId: "b4", erroDisparo: null },
      },
    ];
    const resultados = [
      { json: { estado: "concluido", metricas: { retornoTotal: "1.0", maiorQueda: "2", operacoes: 4 } } },
      { json: { estado: "concluido", metricas: { retornoTotal: "9.0" } } },
      { json: { error: { message: "404" } } },
      { json: { estado: "rodando" } },
    ];
    const r = await executarCodigo(codigoDo(fluxo, "Comparar"), {
      entrada: resultados,
      nos: { "Ids para consultar": planos },
      agoraMs: AGORA,
    });
    const texto = String(json(r).texto);
    expect(texto).toContain("media-rsi@3 · BTCUSDT 1h (robôs: A)");
    expect(texto).toContain("retorno 1.0 · maior queda 2 · operações 4");
    expect(texto).toContain("abaixo do histórico");
    expect(texto).toContain("não disparou (403)");
    expect(texto).toContain("ainda rodando");
    expect(texto).toContain("não é promessa de resultado");
  });

  it("casa cada backtest planejado com a resposta do disparo", async () => {
    const r = await executarCodigo(codigoDo(fluxo, "Ids para consultar"), {
      entrada: [],
      nos: {
        "Planejar backtests": [
          { json: { chave: "k", janela: "recente" } },
          { json: { chave: "k", janela: "base" } },
        ],
        "Disparar backtest": [
          { json: { id: "b1", estado: "fila" } },
          { json: { error: { message: "500" } } },
        ],
      },
      agoraMs: AGORA,
    });
    expect(r.map((i) => [i.json.backtestId, i.json.erroDisparo])).toEqual([
      ["b1", null],
      [null, "500"],
    ]);
  });
});
