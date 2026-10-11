import type { MensagemAssistente } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import {
  comMensagens,
  emAndamento,
  estadoDaEtapa,
  novaResposta,
  reduzirResposta,
  textoParaMostrar,
  type AcaoResposta,
  type RespostaAoVivo,
} from "./estado";

const msg = (id: string, papel: "usuario" | "assistente", texto: string): MensagemAssistente => ({
  id,
  papel,
  texto,
  fontes: [],
  ferramentas: [],
  situacao: "ok",
  erro: null,
  provedor: null,
  modelo: null,
  criadaEm: 1,
});

const aplicar = (r: RespostaAoVivo, ...acoes: AcaoResposta[]) => acoes.reduce(reduzirResposta, r);
const evento = (e: Extract<AcaoResposta, { tipo: "evento" }>["evento"]): AcaoResposta => ({
  tipo: "evento",
  evento: e,
});

describe("resposta ao vivo (redutor)", () => {
  const base = novaResposta("c1", "Como estão os meus robôs?");

  it("começa pensando, sem texto, sem etapas e sem fontes", () => {
    expect(base).toMatchObject({
      conversaId: "c1",
      pergunta: "Como estão os meus robôs?",
      usuario: null,
      texto: "",
      etapas: [],
      fontes: [],
      situacao: "pensando",
      erro: null,
      final: null,
    });
    expect(emAndamento(base)).toBe(true);
  });

  it("junta os pedaços de texto e passa a escrever", () => {
    const r = aplicar(
      base,
      evento({ tipo: "inicio", usuario: msg("u1", "usuario", "Como estão os meus robôs?") }),
      evento({ tipo: "texto", delta: "Os seus " }),
      evento({ tipo: "texto", delta: "robôs estão **bem**." }),
    );
    expect(r.usuario?.id).toBe("u1");
    expect(r.texto).toBe("Os seus robôs estão **bem**.");
    expect(r.situacao).toBe("escrevendo");
  });

  it("a etapa roda até chegar texto ou outra etapa, e então fica feita", () => {
    let r = aplicar(
      base,
      evento({ tipo: "ferramenta", nome: "listar_robos", descricao: "Listando os robôs" }),
    );
    expect(r.etapas).toEqual([{ nome: "listar_robos", descricao: "Listando os robôs", inicioTexto: 0 }]);
    expect(estadoDaEtapa(r, 0)).toBe("rodando");

    r = aplicar(r, evento({ tipo: "ferramenta", nome: "carteira_cripto", descricao: "Lendo a carteira" }));
    expect(estadoDaEtapa(r, 0)).toBe("feita");
    expect(estadoDaEtapa(r, 1)).toBe("rodando");

    r = aplicar(r, evento({ tipo: "texto", delta: "Pronto" }));
    expect(estadoDaEtapa(r, 1)).toBe("feita");
    expect(r.situacao).toBe("escrevendo");
  });

  it("etapa que começa depois de um texto roda até chegar mais texto", () => {
    const r = aplicar(
      base,
      evento({ tipo: "texto", delta: "Vou olhar. " }),
      evento({ tipo: "ferramenta", nome: "renda_fixa", descricao: "Lendo os títulos" }),
    );
    expect(r.etapas[0]?.inicioTexto).toBe(11);
    expect(r.situacao).toBe("pensando");
    expect(estadoDaEtapa(r, 0)).toBe("rodando");
    expect(estadoDaEtapa(aplicar(r, evento({ tipo: "texto", delta: "Achei." })), 0)).toBe("feita");
  });

  it("as fontes trocam a lista (o agente manda a lista inteira no fim)", () => {
    const r = aplicar(
      base,
      evento({ tipo: "fontes", fontes: [{ tipo: "nota", id: "n1", titulo: "Plano" }] }),
      evento({ tipo: "fontes", fontes: [{ tipo: "nota", id: "n2", titulo: "Outro" }] }),
    );
    expect(r.fontes.map((f) => f.id)).toEqual(["n2"]);
  });

  it("o fim guarda a resposta gravada e conclui todas as etapas", () => {
    const final = msg("a1", "assistente", "ok");
    const r = aplicar(
      base,
      evento({ tipo: "ferramenta", nome: "x", descricao: "X" }),
      evento({ tipo: "fim", mensagem: final }),
    );
    expect(r.situacao).toBe("concluida");
    expect(r.final).toBe(final);
    expect(estadoDaEtapa(r, 0)).toBe("feita");
    expect(emAndamento(r)).toBe(false);
  });

  it("falha guarda a mensagem amigável e para as etapas", () => {
    const r = aplicar(base, evento({ tipo: "ferramenta", nome: "x", descricao: "X" }), {
      tipo: "falhou",
      mensagem: "Sem conexão com o servidor.",
    });
    expect(r.situacao).toBe("erro");
    expect(r.erro).toBe("Sem conexão com o servidor.");
    expect(estadoDaEtapa(r, 0)).toBe("parada");
    expect(emAndamento(r)).toBe(false);
  });

  it("parar mantém o texto que já chegou e marca como interrompida", () => {
    const r = aplicar(base, evento({ tipo: "texto", delta: "Metade" }), { tipo: "parou" });
    expect(r.situacao).toBe("interrompida");
    expect(r.texto).toBe("Metade");
  });

  it("depois de terminar, nada mais muda a resposta", () => {
    const parada = aplicar(base, { tipo: "parou" });
    expect(aplicar(parada, evento({ tipo: "texto", delta: "tarde demais" }))).toBe(parada);
    expect(aplicar(parada, { tipo: "falhou", mensagem: "x" })).toBe(parada);
    const concluida = aplicar(base, evento({ tipo: "fim", mensagem: msg("a", "assistente", "") }));
    expect(aplicar(concluida, { tipo: "parou" })).toBe(concluida);
  });
});

describe("comMensagens", () => {
  it("a conversa no cache ganha as mensagens novas sem repetir", () => {
    const c = {
      id: "c",
      titulo: "t",
      previa: "",
      criadaEm: 1,
      atualizadaEm: 1,
      mensagens: [msg("u", "usuario", "p")],
    };
    const nova = comMensagens(c, [msg("u", "usuario", "p"), msg("a", "assistente", "r")]);
    expect(nova?.mensagens.map((m) => m.id)).toEqual(["u", "a"]);
    expect(comMensagens(undefined, [])).toBeUndefined();
  });
});

describe("textoParaMostrar (durante o streaming)", () => {
  it("segura a tabela que ainda não tem a linha separadora, para não piscar o texto cru", () => {
    expect(textoParaMostrar("Resumo:\n\n| Robô | Modo |\n| --")).toBe("Resumo:\n\n");
    expect(textoParaMostrar("| Robô | Mo")).toBe("");
  });

  it("tabela com cabeçalho e separador já aparece, mesmo com a linha em andamento", () => {
    const t = "Resumo:\n\n| Robô | Modo |\n| --- | --- |\n| BTC | Pa";
    expect(textoParaMostrar(t)).toBe(t);
  });

  it("texto comum passa inteiro", () => {
    expect(textoParaMostrar("Olá, **mundo**")).toBe("Olá, **mundo**");
    expect(textoParaMostrar("a | b")).toBe("a | b");
  });
});
