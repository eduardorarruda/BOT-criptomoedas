import { CABECALHO_ASSINATURA, TOLERANCIA_SEGUNDOS } from "@zentrade/contratos";
import { describe, expect, it } from "vitest";
import { casa, lerContrato, rotasDaCelula } from "./contrato.js";
import { carregarFluxos, type NoN8n } from "./fluxos.js";

const contrato = lerContrato();
const fluxos = carregarFluxos().map((a) => a.fluxo);
const PREFIXO_API = "={{ $env.ZENTRADE_API_URL }}";

interface Chamada {
  readonly fluxo: string;
  readonly no: NoN8n;
  readonly metodo: string;
  readonly caminho: string;
}

/** Toda chamada HTTP dos fluxos para a API do ZenTrade, com expressões trocadas por ":param". */
const chamadas: Chamada[] = fluxos.flatMap((f) =>
  f.nodes
    .filter((n) => n.type === "n8n-nodes-base.httpRequest")
    .filter((n) => String(n.parameters.url).startsWith(PREFIXO_API))
    .map((n) => ({
      fluxo: f.name,
      no: n,
      metodo: typeof n.parameters.method === "string" ? n.parameters.method : "GET",
      caminho: String(n.parameters.url)
        .slice(PREFIXO_API.length)
        .replace(/\{\{.*?\}\}/g, ":param")
        .split("?")[0] as string,
    })),
);

const cabecalhos = (n: NoN8n): { name: string; value: string }[] =>
  (n.parameters.headerParameters as { parameters?: { name: string; value: string }[] } | undefined)
    ?.parameters ?? [];

describe("leitura de docs/contrato-api.md", () => {
  it("entende as abreviações das tabelas", () => {
    expect(rotasDaCelula("`POST /decisoes/:id/aprovar` · `/recusar`", "/api/v1")).toEqual([
      { metodo: "POST", caminho: "/api/v1/decisoes/:id/aprovar" },
      { metodo: "POST", caminho: "/api/v1/decisoes/:id/recusar" },
    ]);
    expect(rotasDaCelula("`GET /tokens` · `POST` · `DELETE /:id`", "/api/v1")).toEqual([
      { metodo: "GET", caminho: "/api/v1/tokens" },
      { metodo: "POST", caminho: "/api/v1/tokens" },
      { metodo: "DELETE", caminho: "/api/v1/tokens/:id" },
    ]);
  });

  it("acha as rotas, os webhooks e o cabeçalho de assinatura", () => {
    expect(contrato.rest.length).toBeGreaterThan(20);
    expect(contrato.webhooksApi.map((r) => r.caminho).sort()).toEqual([
      "/webhooks/n8n/aprovacao",
      "/webhooks/n8n/conhecimento",
      "/webhooks/n8n/saude",
    ]);
    expect([...contrato.webhooksN8n].sort()).toEqual([
      "/webhook/zentrade-alerta",
      "/webhook/zentrade-proposta",
    ]);
  });

  it("o cabeçalho e o prazo documentados são os mesmos de @zentrade/contratos", () => {
    expect(contrato.cabecalhoAssinatura.toLowerCase()).toBe(CABECALHO_ASSINATURA);
    expect(contrato.toleranciaMinutos * 60).toBe(TOLERANCIA_SEGUNDOS);
  });
});

describe("chamadas dos fluxos para a API", () => {
  it("existem e cada uma bate com uma rota documentada (método e caminho)", () => {
    expect(chamadas.length).toBeGreaterThan(5);
    const documentadas = [...contrato.rest, ...contrato.webhooksApi];
    for (const c of chamadas) {
      const achou = documentadas.some((r) => r.metodo === c.metodo && casa(r.caminho, c.caminho));
      expect(achou, `${c.fluxo} → ${c.no.name}: ${c.metodo} ${c.caminho} não está no contrato`).toBe(true);
    }
  });

  it("cobrem todos os webhooks que a API oferece ao n8n", () => {
    const usados = new Set(chamadas.filter((c) => c.caminho.startsWith("/webhooks/")).map((c) => c.caminho));
    for (const r of contrato.webhooksApi) expect(usados.has(r.caminho), r.caminho).toBe(true);
  });

  it("assinam todo webhook com o cabeçalho documentado e mandam o corpo exato que foi assinado", () => {
    for (const c of chamadas.filter((x) => x.caminho.startsWith("/webhooks/"))) {
      const cab = cabecalhos(c.no);
      expect(cab, `${c.fluxo} → ${c.no.name}`).toEqual([
        {
          name: contrato.cabecalhoAssinatura,
          value: "={{ 't=' + $json.carimbo + ',v1=' + $json.assinatura }}",
        },
      ]);
      expect(c.no.credentials, "webhook não usa token: a assinatura é a autenticação").toBeUndefined();
      if (c.no.parameters.sendBody === true) {
        expect(c.no.parameters).toMatchObject({
          contentType: "raw",
          rawContentType: "application/json",
          body: "={{ $json.corpo }}",
        });
      }
    }
  });

  it("usam token de leitura para consultar e de operar só para agir", () => {
    for (const c of chamadas.filter((x) => x.caminho.startsWith("/api/v1/"))) {
      expect(c.no.parameters).toMatchObject({
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
      });
      const nome = c.no.credentials?.httpHeaderAuth?.name;
      const esperado = c.metodo === "GET" ? "ZenTrade token leitura" : "ZenTrade token operar";
      expect(nome, `${c.fluxo} → ${c.no.name}`).toBe(esperado);
    }
  });

  it("a consulta de decisões respeita o limite de 200 do contrato", () => {
    const decisoes = chamadas.find((c) => c.caminho === "/api/v1/decisoes");
    const consulta = (
      decisoes?.no.parameters.queryParameters as { parameters: { name: string; value: string }[] }
    ).parameters;
    expect(Number(consulta.find((p) => p.name === "limite")?.value)).toBeLessThanOrEqual(200);
  });
});

describe("webhooks que o n8n expõe para a API", () => {
  it("são exatamente os caminhos documentados", () => {
    const expostos = fluxos.flatMap((f) =>
      f.nodes
        .filter((n) => n.type === "n8n-nodes-base.webhook")
        .map((n) => `/webhook/${String(n.parameters.path)}`),
    );
    expect(expostos.sort()).toEqual([...contrato.webhooksN8n].sort());
  });
});
