import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AutomacaoEsquema,
  BacktestEsquema,
  ConhecimentoWebhookEsquema,
  DocumentoIngeridoEsquema,
  ResumoEsquema,
  SaudeN8nEsquema,
  SessaoEsquema,
  TokenCriadoEsquema,
} from "./esquemas.js";
import { assinar, lerCabecalhoAssinatura, segundosDeValidade, TOLERANCIA_SEGUNDOS } from "./webhook.js";

const usuario = { id: "u1", email: "ana@exemplo.com", nome: "Ana", doisFatores: false };

describe("contrato da API", () => {
  it("sessão traz a pessoa e o token CSRF", () => {
    expect(SessaoEsquema.safeParse({ usuario, csrf: "c".repeat(43) }).success).toBe(true);
    expect(SessaoEsquema.safeParse({ usuario }).success).toBe(false);
  });

  it("resumo exige taxasHoje em decimal de texto", () => {
    const resumo = {
      resultadoHoje: "1.5",
      exposicao: "0",
      maiorQueda30d: "0",
      robosAtivos: 1,
      custoIaHoje: "0.01",
      paradaTotal: false,
    };
    expect(ResumoEsquema.safeParse(resumo).success).toBe(false);
    expect(ResumoEsquema.safeParse({ ...resumo, taxasHoje: "0.12" }).success).toBe(true);
  });

  it("backtest concluído usa os nomes estáveis de métricas que o motor grava", () => {
    const backtest = {
      id: "b1",
      estado: "concluido",
      estrategiaId: "e1",
      versao: 1,
      simbolo: "BTCUSDT",
      intervalo: "1h",
      inicio: 1,
      fim: 2,
      metricas: {
        resultadoLiquido: "-3.2",
        patrimonioFinal: "996.8",
        maiorQueda: "12.5",
        maiorQuedaPercentual: 0.0125,
        operacoes: 4,
        acertos: 1,
        taxaAcerto: 0.25,
        taxasPagas: "1.9",
        ordens: 8,
      },
      curva: [{ em: 1, patrimonio: "1000" }],
      erro: null,
      criadoEm: 1,
      concluidoEm: 2,
    };
    expect(BacktestEsquema.safeParse(backtest).success).toBe(true);
    const naFila = { ...backtest, estado: "na_fila", metricas: null, curva: null, concluidoEm: null };
    expect(BacktestEsquema.safeParse(naFila).success).toBe(true);
    const antigo = { ...backtest, metricas: { resultado: "1", taxas: "0" } };
    expect(BacktestEsquema.safeParse(antigo).success).toBe(false);
  });

  it("token criado aparece em claro uma vez; documento ingerido diz se era novo", () => {
    const token = { id: "t1", nome: "cli", escopo: "leitura", criadoEm: 1, ultimoUsoEm: null };
    expect(TokenCriadoEsquema.safeParse({ ...token, token: "zt_" + "a".repeat(40) }).success).toBe(true);
    expect(TokenCriadoEsquema.safeParse(token).success).toBe(false);
    const doc = { id: "d1", fonte: "nota", titulo: "x", url: null, publicadoEm: 1, criadoEm: 1 };
    expect(DocumentoIngeridoEsquema.safeParse({ ...doc, novo: true, trechos: 2 }).success).toBe(true);
  });

  it("automação sem execução tem resultado 'nunca'", () => {
    const a = {
      id: "zentrade-alertas",
      nome: "Alertas",
      descricao: "x",
      ativa: true,
      ultimaExecucaoEm: null,
      ultimoResultado: "nunca",
      falhas24h: 0,
    };
    expect(AutomacaoEsquema.safeParse(a).success).toBe(true);
  });
});

describe("contrato dos webhooks", () => {
  const noticia = { fonte: "noticia", titulo: "ETF", publicadoEm: 1, texto: "texto" };

  it("conhecimento só aceita url http(s)", () => {
    expect(ConhecimentoWebhookEsquema.safeParse({ ...noticia, url: "https://x.com/a" }).success).toBe(true);
    expect(ConhecimentoWebhookEsquema.safeParse({ ...noticia, url: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });

  it("saúde para o vigia aceita motor que nunca bateu", () => {
    expect(SaudeN8nEsquema.safeParse({ motorVivoHaSegundos: null, robosPausados: 0 }).success).toBe(true);
  });

  it("lê o cabeçalho e calcula por quanto tempo a assinatura ainda vale", () => {
    const agora = 1_760_000_000_000;
    const lido = lerCabecalhoAssinatura(assinar("", "s".repeat(32), agora));
    expect(lido?.carimbo).toBe(agora / 1000);
    expect(lido?.v1).toMatch(/^[0-9a-f]{64}$/);
    expect(lerCabecalhoAssinatura("t=1,v1=curto")).toBeNull();
    expect(lerCabecalhoAssinatura(undefined)).toBeNull();
    expect(segundosDeValidade(agora / 1000, agora)).toBe(TOLERANCIA_SEGUNDOS + 1);
    expect(segundosDeValidade(agora / 1000 + 100, agora)).toBe(TOLERANCIA_SEGUNDOS + 101);
    expect(segundosDeValidade(0, agora)).toBe(1);
  });
});

describe("subcaminho @zentrade/contratos/esquemas", () => {
  const pasta = dirname(fileURLToPath(import.meta.url));

  /** Segue os imports relativos a partir de um arquivo e devolve os de pacote encontrados. */
  function importsAlcancaveis(arquivo: string, vistos = new Set<string>()): string[] {
    if (vistos.has(arquivo)) return [];
    vistos.add(arquivo);
    const texto = readFileSync(join(pasta, arquivo), "utf8");
    const alvos = [...texto.matchAll(/from "([^"]+)"/g)].map((m) => m[1] as string);
    return alvos.flatMap((alvo) =>
      alvo.startsWith("./") ? importsAlcancaveis(alvo.replace(/\.js$/, ".ts"), vistos) : [alvo],
    );
  }

  it("não leva node:crypto (nem nada de node:) para o navegador", () => {
    const externos = importsAlcancaveis("esquemas.ts");
    expect(externos.filter((m) => m.startsWith("node:"))).toEqual([]);
    expect(importsAlcancaveis("webhook.ts")).toContain("node:crypto");
  });
});
