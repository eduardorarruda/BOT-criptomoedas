import type { EventoRespostaAgente } from "@zentrade/contratos";
import { diaNoFuso } from "@zentrade/dominio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClienteAssistente } from "../integracoes/assistente.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

const DIA_MS = 86_400_000;
const COPOM = { data: "2026-10-28", mercado: "win", titulo: "Copom — decisão da Selic", impacto: "alto" };

/** O Claude do teste: devolve o que o cenário mandar, sem rede. */
class ClaudeFalso implements Pick<ClienteAssistente, "estado" | "responder"> {
  perguntas: string[] = [];
  eventos: EventoRespostaAgente[] = [];
  falhar = false;
  tokenClaude = {} as ClienteAssistente["tokenClaude"];
  estado = async () => null;
  async *responder(pedido: { pergunta: string }) {
    this.perguntas.push(pedido.pergunta);
    if (this.falhar) throw new Error("agente fora do ar");
    yield* this.eventos;
  }
  diz(texto: string) {
    this.eventos = [
      { tipo: "texto", delta: texto },
      { tipo: "concluido", provedor: "api", modelo: "claude-teste" },
    ];
  }
}

describe("agenda de eventos de mercado (API)", () => {
  const claude = new ClaudeFalso();
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;

  const chamar = (p: Pessoa, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    api = await montarApi({ extras: () => ({ assistente: claude as unknown as ClienteAssistente }) });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  it("exige autenticação", async () => {
    const r = await api.app.inject({
      method: "GET",
      url: "/api/v1/eventos-mercado?de=2026-10-01&ate=2026-10-31",
    });
    expect(r.statusCode).toBe(401);
  });

  it("cria, lista por período, confirma e remove; a auditoria registra", async () => {
    const criado = await chamar(ana, "POST", "/eventos-mercado", COPOM);
    expect(criado.statusCode).toBe(201);
    expect(criado.json()).toMatchObject({ ...COPOM, origem: "manual", de: null, ate: null });
    const lista = await chamar(ana, "GET", "/eventos-mercado?de=2026-10-01&ate=2026-10-31");
    expect(lista.json()).toHaveLength(1);
    expect((await chamar(ana, "GET", "/eventos-mercado?de=2026-11-01&ate=2026-11-30")).json()).toEqual([]);
    const id = criado.json().id as string;
    expect((await chamar(ana, "POST", `/eventos-mercado/${id}/confirmar`)).json()).toMatchObject({
      origem: "manual",
    });
    expect((await chamar(ana, "DELETE", `/eventos-mercado/${id}`)).statusCode).toBe(204);
    expect((await chamar(ana, "DELETE", `/eventos-mercado/${id}`)).statusCode).toBe(404);
    const trilha = await api.banco.conexao.sql.unsafe(
      `select acao from auditoria where usuario_id = '${ana.id}' and acao like 'evento_mercado%' order by sequencia`,
    );
    expect(trilha.map((l) => l.acao)).toEqual([
      "evento_mercado_criado",
      "evento_mercado_confirmado",
      "evento_mercado_removido",
    ]);
  });

  it("valida o corpo e a consulta com mensagem clara", async () => {
    for (const ruim of [
      { ...COPOM, data: "2026-02-30" },
      { ...COPOM, titulo: "  " },
      { ...COPOM, impacto: "baixo" },
      { ...COPOM, de: "15:00", ate: "14:00" },
      { ...COPOM, extra: 1 },
    ]) {
      const r = await chamar(ana, "POST", "/eventos-mercado", ruim);
      expect(r.statusCode, JSON.stringify(ruim)).toBe(400);
    }
    expect((await chamar(ana, "GET", "/eventos-mercado?de=2026-12-01&ate=2026-01-01")).statusCode).toBe(400);
    expect((await chamar(ana, "GET", "/eventos-mercado")).statusCode).toBe(400);
  });

  it("evento repetido dá 409 com explicação", async () => {
    await chamar(ana, "POST", "/eventos-mercado", { ...COPOM, titulo: "IPCA" });
    const r = await chamar(ana, "POST", "/eventos-mercado", { ...COPOM, titulo: "IPCA" });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro.mensagem).toContain("já existe");
  });

  it("uma pessoa não vê, não confirma e não remove o evento da outra", async () => {
    const id = (await chamar(ana, "POST", "/eventos-mercado", { ...COPOM, titulo: "Só da Ana" })).json()
      .id as string;
    expect((await chamar(beto, "GET", "/eventos-mercado?de=2026-01-01&ate=2026-12-31")).json()).toEqual([]);
    expect((await chamar(beto, "POST", `/eventos-mercado/${id}/confirmar`)).statusCode).toBe(404);
    expect((await chamar(beto, "DELETE", `/eventos-mercado/${id}`)).statusCode).toBe(404);
    expect((await chamar(beto, "DELETE", "/eventos-mercado/nao-uuid")).statusCode).toBe(404);
  });

  it("token de leitura lê a agenda, mas não escreve (escopo operar)", async () => {
    const criado = await api.app.inject({
      method: "POST",
      url: "/api/v1/tokens",
      headers: comSessao(ana),
      payload: { nome: "so-leitura", escopo: "leitura" },
    });
    const bearer = { authorization: `Bearer ${criado.json().token}` };
    const le = await api.app.inject({
      method: "GET",
      url: "/api/v1/eventos-mercado?de=2026-01-01&ate=2026-12-31",
      headers: bearer,
    });
    expect(le.statusCode).toBe(200);
    const escreve = await api.app.inject({
      method: "POST",
      url: "/api/v1/eventos-mercado",
      headers: bearer,
      payload: COPOM,
    });
    expect(escreve.json()).toMatchObject({ erro: { codigo: "escopo_insuficiente" } });
    const apaga = await api.app.inject({
      method: "POST",
      url: "/api/v1/eventos-mercado/sugerir",
      headers: bearer,
    });
    expect(apaga.json()).toMatchObject({ erro: { codigo: "escopo_insuficiente" } });
  });

  describe("sugerir eventos da semana (Claude)", () => {
    const hoje = () => diaNoFuso(api.relogio.t, "America/Sao_Paulo");
    const emDias = (n: number) => diaNoFuso(api.relogio.t + n * DIA_MS, "America/Sao_Paulo");

    it("grava como 'sugerido', valida cada item, descarta o inválido e pede só calendário oficial", async () => {
      claude.diz(
        `Aqui está:\n\`\`\`json\n${JSON.stringify({
          eventos: [
            { data: emDias(2), mercado: "win", titulo: "IPCA", impacto: "alto", certeza: "alta" },
            { data: emDias(3), mercado: "todos", titulo: "Payroll (EUA)", impacto: "alto", certeza: "baixa" },
            { data: emDias(40), mercado: "win", titulo: "Longe demais", impacto: "alto", certeza: "alta" },
            {
              data: hoje(),
              mercado: "win",
              titulo: "Campo extra",
              impacto: "alto",
              certeza: "alta",
              rodar: "rm -rf /",
            },
          ],
        })}\n\`\`\``,
      );
      const r = await chamar(beto, "POST", "/eventos-mercado/sugerir");
      expect(r.statusCode).toBe(200);
      const corpo = r.json();
      expect(corpo.criados.map((e: { titulo: string }) => e.titulo)).toEqual([
        "IPCA",
        "Payroll (EUA) (data a confirmar)",
      ]);
      expect(corpo.criados.every((e: { origem: string }) => e.origem === "sugerido")).toBe(true);
      expect(corpo.descartados).toBe(2);
      expect(claude.perguntas.at(-1)).toMatch(/Não invente/);
      // repetir não duplica
      const de_novo = (await chamar(beto, "POST", "/eventos-mercado/sugerir")).json();
      expect(de_novo.criados).toEqual([]);
      expect(de_novo.jaExistiam).toBe(2);
      // a pessoa confirma uma e remove a outra
      const [ipca, payroll] = corpo.criados as { id: string }[];
      expect((await chamar(beto, "POST", `/eventos-mercado/${ipca!.id}/confirmar`)).json().origem).toBe(
        "manual",
      );
      expect((await chamar(beto, "DELETE", `/eventos-mercado/${payroll!.id}`)).statusCode).toBe(204);
    });

    it("agente fora do ar ou resposta sem sentido: erro claro e nada gravado", async () => {
      const antes = (await chamar(ana, "GET", "/eventos-mercado?de=2000-01-01&ate=2030-12-31")).json().length;
      claude.falhar = true;
      const fora = await chamar(ana, "POST", "/eventos-mercado/sugerir");
      expect(fora.statusCode).toBe(502);
      claude.falhar = false;
      claude.diz("Desculpe, não sei dizer.");
      const vazia = await chamar(ana, "POST", "/eventos-mercado/sugerir");
      expect(vazia.statusCode).toBe(200);
      expect(vazia.json().criados).toEqual([]);
      claude.diz(
        JSON.stringify({
          eventos: [{ data: "ontem", mercado: "win", titulo: "x", impacto: "alto", certeza: "alta" }],
        }),
      );
      expect((await chamar(ana, "POST", "/eventos-mercado/sugerir")).statusCode).toBe(502);
      claude.eventos = [
        { tipo: "erro", codigo: "orcamento_ia", mensagem: "O assistente está parado: limite do dia" },
      ];
      const orcamento = await chamar(ana, "POST", "/eventos-mercado/sugerir");
      expect(orcamento.statusCode).toBe(502);
      expect(orcamento.json().erro.mensagem).toContain("limite do dia");
      const depois = (await chamar(ana, "GET", "/eventos-mercado?de=2000-01-01&ate=2030-12-31")).json()
        .length;
      expect(depois).toBe(antes);
    });
  });
});
