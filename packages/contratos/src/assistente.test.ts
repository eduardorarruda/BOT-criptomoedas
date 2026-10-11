import { describe, expect, it } from "vitest";
import {
  ConfigAssistenteEsquema,
  DocumentoDetalheEsquema,
  EventoChatEsquema,
  EventoRespostaAgenteEsquema,
  FonteCitadaEsquema,
  ModeloIa,
  MudancaConfigAssistenteEsquema,
  NovaMensagemEsquema,
  NovoLinkEsquema,
  PedidoRespostaAgenteEsquema,
} from "./assistente.js";

const USUARIO = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";

describe("configuração do assistente", () => {
  it("aceita API ou CLI, com modelo e conta opcionais", () => {
    expect(ConfigAssistenteEsquema.parse({ provedor: "cli", modelo: "sonnet", contaCli: "pessoal" })).toEqual(
      {
        provedor: "cli",
        modelo: "sonnet",
        contaCli: "pessoal",
      },
    );
    expect(ConfigAssistenteEsquema.safeParse({ provedor: "gpt", modelo: null, contaCli: null }).success).toBe(
      false,
    );
  });

  it("modelo não pode virar opção de linha de comando nem ter espaço", () => {
    for (const ruim of ["--dangerously-skip-permissions", "-p", "a b", "x;rm", ""]) {
      expect(ModeloIa.safeParse(ruim).success, ruim).toBe(false);
    }
    for (const bom of ["claude-opus-5", "opus", "claude-sonnet-5", "us.anthropic.claude-opus-5:0"]) {
      expect(ModeloIa.safeParse(bom).success, bom).toBe(true);
    }
  });

  it("mudança parcial recusa campos desconhecidos e conta com caractere estranho", () => {
    expect(MudancaConfigAssistenteEsquema.safeParse({ provedor: "api" }).success).toBe(true);
    expect(MudancaConfigAssistenteEsquema.safeParse({ caminho: "/bin/sh" }).success).toBe(false);
    expect(MudancaConfigAssistenteEsquema.safeParse({ contaCli: "../root" }).success).toBe(false);
  });
});

describe("chat", () => {
  it("pergunta tem tamanho mínimo e máximo e é aparada", () => {
    expect(NovaMensagemEsquema.parse({ texto: "  oi  " }).texto).toBe("oi");
    expect(NovaMensagemEsquema.safeParse({ texto: "   " }).success).toBe(false);
    expect(NovaMensagemEsquema.safeParse({ texto: "x".repeat(8001) }).success).toBe(false);
  });

  it("fonte citada só leva link http(s); o resto vira null", () => {
    const base = { tipo: "nota", id: "n1", titulo: "Nota" };
    expect(FonteCitadaEsquema.parse({ ...base, url: "javascript:alert(1)" }).url).toBeNull();
    expect(FonteCitadaEsquema.parse({ ...base, url: "https://exemplo.com/a" }).url).toBe(
      "https://exemplo.com/a",
    );
  });

  it("eventos do agente e da tela são uniões discriminadas pelo tipo", () => {
    expect(EventoRespostaAgenteEsquema.parse({ tipo: "texto", delta: "Olá" })).toEqual({
      tipo: "texto",
      delta: "Olá",
    });
    expect(EventoRespostaAgenteEsquema.safeParse({ tipo: "ordem", delta: "x" }).success).toBe(false);
    const fim = EventoChatEsquema.parse({
      tipo: "fim",
      mensagem: {
        id: "m1",
        papel: "assistente",
        texto: "ok",
        fontes: [],
        ferramentas: [{ nome: "resumo", descricao: "Lendo o resumo" }],
        situacao: "ok",
        erro: null,
        provedor: "cli",
        modelo: null,
        criadaEm: 1,
      },
    });
    expect(fim.tipo).toBe("fim");
  });

  it("pedido ao agente limita o histórico", () => {
    const historico = Array.from({ length: 41 }, () => ({ papel: "usuario", texto: "a" }));
    const pedido = { usuarioId: USUARIO, historico, pergunta: "e agora?" };
    expect(PedidoRespostaAgenteEsquema.safeParse(pedido).success).toBe(false);
    expect(PedidoRespostaAgenteEsquema.safeParse({ ...pedido, historico: historico.slice(1) }).success).toBe(
      true,
    );
  });
});

describe("conhecimento", () => {
  it("link só http(s) e com fonte padrão nota", () => {
    expect(NovoLinkEsquema.parse({ url: "https://exemplo.com" }).fonte).toBe("nota");
    expect(NovoLinkEsquema.safeParse({ url: "file:///etc/passwd" }).success).toBe(false);
    expect(NovoLinkEsquema.safeParse({ url: "ftp://exemplo.com" }).success).toBe(false);
  });

  it("detalhe do documento traz a origem e a contagem de trechos", () => {
    const d = DocumentoDetalheEsquema.parse({
      id: "d1",
      fonte: "nota",
      titulo: "Plano",
      url: null,
      publicadoEm: 1,
      criadoEm: 1,
      origem: "arquivo",
      nomeArquivo: "plano.pdf",
      tipoArquivo: "pdf",
      bytes: 1234,
      trechos: 3,
    });
    expect(d.origem).toBe("arquivo");
  });
});
