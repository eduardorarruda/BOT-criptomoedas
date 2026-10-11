import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { carregarFluxos, no, seguintes, type FluxoN8n, type NoN8n } from "./fluxos.js";

/** Tipos e versões de nó conferidos contra o n8n 2.42 (n8n-nodes-base 2.42.4). */
const VERSOES: Record<string, readonly number[]> = {
  "n8n-nodes-base.scheduleTrigger": [1.2],
  "n8n-nodes-base.webhook": [2.1],
  "n8n-nodes-base.extractFromFile": [1.1],
  "n8n-nodes-base.code": [2],
  "n8n-nodes-base.crypto": [2],
  "n8n-nodes-base.if": [2.2],
  "n8n-nodes-base.respondToWebhook": [1.1],
  "n8n-nodes-base.httpRequest": [4.2],
  "n8n-nodes-base.telegram": [1.2],
  "n8n-nodes-base.set": [3.4],
  "n8n-nodes-base.rssFeedRead": [1.2],
  "n8n-nodes-base.wait": [1.1],
  "n8n-nodes-base.emailSend": [2.1],
};
const GATILHOS = new Set(["n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.webhook"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const AGENDAS: Record<string, string> = {
  "zentrade-noticias": "*/15 * * * *",
  "zentrade-relatorio-diario": "0 21 * * *",
  "zentrade-vigia-saude": "* * * * *",
  "zentrade-revalidacao-semanal": "0 8 * * 0",
};
const WEBHOOKS: Record<string, string> = {
  "zentrade-aprovacao": "zentrade-proposta",
  "zentrade-alertas": "zentrade-alerta",
};

const arquivos = carregarFluxos();

function alcancaveis(fluxo: FluxoN8n, de: string): Set<string> {
  const vistos = new Set<string>([de]);
  const fila = [de];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const saida of fluxo.connections[atual]?.main ?? []) {
      for (const l of saida) {
        if (!vistos.has(l.node)) {
          vistos.add(l.node);
          fila.push(l.node);
        }
      }
    }
  }
  return vistos;
}

const gatilhoDe = (fluxo: FluxoN8n): NoN8n => {
  const gatilhos = fluxo.nodes.filter((n) => GATILHOS.has(n.type));
  expect(gatilhos).toHaveLength(1);
  return gatilhos[0] as NoN8n;
};

describe("conjunto de fluxos", () => {
  it("tem exatamente os seis fluxos do ZenTrade, um por arquivo com o nome do fluxo", () => {
    expect(arquivos.map((a) => a.fluxo.name).sort()).toEqual([
      "zentrade-alertas",
      "zentrade-aprovacao",
      "zentrade-noticias",
      "zentrade-relatorio-diario",
      "zentrade-revalidacao-semanal",
      "zentrade-vigia-saude",
    ]);
    for (const a of arquivos) expect(a.arquivo).toBe(`${a.fluxo.name}.json`);
  });

  it("não repete ids de nó nem ids de webhook entre fluxos", () => {
    const ids = arquivos.flatMap((a) => a.fluxo.nodes.map((n) => n.id));
    const webhooks = arquivos.flatMap((a) =>
      a.fluxo.nodes.flatMap((n) => (n.webhookId ? [n.webhookId] : [])),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(webhooks).size).toBe(webhooks.length);
  });
});

describe.each(arquivos.map((a) => [a.fluxo.name, a.fluxo] as const))("%s", (nome, fluxo) => {
  it("tem a forma de uma exportação do n8n e chega desligado", () => {
    expect(typeof fluxo.name).toBe("string");
    expect(Array.isArray(fluxo.nodes)).toBe(true);
    expect(typeof fluxo.connections).toBe("object");
    expect(fluxo.active).toBe(false);
    expect(fluxo.settings.executionOrder).toBe("v1");
    expect(fluxo.settings.timezone).toBe("America/Sao_Paulo");
  });

  it("usa só nós padrão, nas versões conferidas, com id, nome e posição válidos", () => {
    const nomes = new Set<string>();
    for (const n of fluxo.nodes) {
      expect(VERSOES[n.type], `tipo inesperado: ${n.type}`).toBeDefined();
      expect(VERSOES[n.type]).toContain(n.typeVersion);
      expect(n.id).toMatch(UUID);
      expect(nomes.has(n.name), `nome repetido: ${n.name}`).toBe(false);
      nomes.add(n.name);
      expect(n.position).toHaveLength(2);
      expect(n.position.every((c) => Number.isFinite(c))).toBe(true);
      expect(typeof n.parameters).toBe("object");
    }
  });

  it("liga só nós que existem e todo nó é alcançável a partir do gatilho", () => {
    const nomes = new Set(fluxo.nodes.map((n) => n.name));
    for (const [origem, saidas] of Object.entries(fluxo.connections)) {
      expect(nomes.has(origem), `ligação de nó inexistente: ${origem}`).toBe(true);
      for (const l of saidas.main.flat()) {
        expect(nomes.has(l.node), `ligação para nó inexistente: ${l.node}`).toBe(true);
        expect(l.type).toBe("main");
      }
    }
    const alcance = alcancaveis(fluxo, gatilhoDe(fluxo).name);
    for (const n of fluxo.nodes) expect(alcance.has(n.name), `nó solto: ${n.name}`).toBe(true);
  });

  it("tem código JavaScript que compila em todo nó Code", () => {
    for (const n of fluxo.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
      const codigo = n.parameters.jsCode;
      expect(typeof codigo).toBe("string");
      expect(() => new Script(`(async () => {\n${String(codigo)}\n})`)).not.toThrow();
    }
  });

  it("manda mensagens do Telegram em HTML, sem a propaganda do n8n", () => {
    for (const n of fluxo.nodes.filter((x) => x.type === "n8n-nodes-base.telegram")) {
      expect(n.parameters.chatId).toBe("={{ $env.TELEGRAM_CHAT_ID }}");
      if (n.parameters.operation === "sendAndWait") {
        expect(n.parameters.options).toMatchObject({ appendAttribution: false });
      } else {
        expect(n.parameters.additionalFields).toEqual({ appendAttribution: false, parse_mode: "HTML" });
      }
    }
  });

  it("calcula HMAC só pelo nó Crypto com a credencial de assinatura", () => {
    for (const n of fluxo.nodes.filter((x) => x.type === "n8n-nodes-base.crypto")) {
      expect(n.parameters).toMatchObject({
        action: "hmac",
        type: "SHA256",
        encoding: "hex",
        binaryData: false,
      });
      expect(n.parameters.value).toBe("={{ $json.mensagem }}");
      expect(Object.keys(n.credentials ?? {})).toEqual(["crypto"]);
    }
  });

  if (AGENDAS[nome]) {
    it(`roda no horário combinado (${AGENDAS[nome]}, horário de Brasília)`, () => {
      const g = gatilhoDe(fluxo);
      expect(g.type).toBe("n8n-nodes-base.scheduleTrigger");
      expect(g.parameters.rule).toEqual({
        interval: [{ field: "cronExpression", expression: AGENDAS[nome] }],
      });
    });
  }

  if (WEBHOOKS[nome]) {
    it("recebe por webhook com corpo bruto e confere a assinatura antes de qualquer outra coisa", () => {
      const g = gatilhoDe(fluxo);
      expect(g.type).toBe("n8n-nodes-base.webhook");
      expect(g.webhookId).toMatch(UUID);
      expect(g.parameters).toMatchObject({
        httpMethod: "POST",
        path: WEBHOOKS[nome],
        responseMode: "responseNode",
        options: { rawBody: true },
      });
      const cadeia = [
        g.name,
        "Ler corpo bruto",
        "Preparar verificação",
        "Calcular HMAC",
        "Conferir assinatura",
      ];
      cadeia.slice(0, -1).forEach((atual, i) => expect(seguintes(fluxo, atual)).toEqual([cadeia[i + 1]]));
      expect(seguintes(fluxo, "Conferir assinatura")).toEqual(["Assinatura válida?"]);
      expect(no(fluxo, "Assinatura válida?").parameters.conditions).toMatchObject({
        conditions: [{ leftValue: "={{ $json.valida }}", operator: { type: "boolean", operation: "true" } }],
      });
      expect(seguintes(fluxo, "Assinatura válida?", 1)).toEqual(["Recusar (401)"]);
      expect(no(fluxo, "Recusar (401)").parameters.options).toEqual({ responseCode: 401 });
    });

    it("só aceita (202) pelo ramo da assinatura válida", () => {
      const pelaRecusa = alcancaveis(fluxo, "Recusar (401)");
      expect(pelaRecusa).toEqual(new Set(["Recusar (401)"]));
      const aceitar = no(fluxo, "Aceitar (202)");
      expect(aceitar.parameters.options).toEqual({ responseCode: 202 });
      expect(
        alcancaveis(fluxo, seguintes(fluxo, "Assinatura válida?", 0)[0] as string).has(aceitar.name),
      ).toBe(true);
    });
  }
});

describe("zentrade-aprovacao", () => {
  const fluxo = arquivos.find((a) => a.fluxo.name === "zentrade-aprovacao")?.fluxo as FluxoN8n;

  it("pede aprovação com botões Aprovar/Recusar e espera no máximo até o limite calculado", () => {
    const pedir = no(fluxo, "Pedir aprovação no Telegram");
    expect(pedir.parameters).toMatchObject({
      operation: "sendAndWait",
      approvalOptions: {
        values: { approvalType: "double", approveLabel: "✅ Aprovar", disapproveLabel: "❌ Recusar" },
      },
      options: {
        limitWaitTime: {
          values: { limitType: "atSpecifiedTime", maxDateAndTime: "={{ $json.limiteEspera }}" },
        },
      },
    });
    expect(pedir.webhookId).toMatch(UUID);
  });

  it("só pede aprovação para proposta nova e ainda válida, depois de responder 202", () => {
    expect(seguintes(fluxo, "Aceitar (202)")).toEqual(["Ainda vale e é nova?"]);
    expect(seguintes(fluxo, "Ainda vale e é nova?", 0)).toEqual(["Pedir aprovação no Telegram"]);
    expect(seguintes(fluxo, "Ainda vale e é nova?", 1)).toEqual([]);
  });
});
