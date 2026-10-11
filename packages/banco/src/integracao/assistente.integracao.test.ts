import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario } from "../cliente.js";
import { assistenteMensagens } from "../esquema/index.js";
import { criarBancoDoAgente, type BancoDoAgente } from "../repositorios/assistente-agente.js";
import { montarCenario, type Cenario } from "./ajuda.js";

const vetor = () => Array.from({ length: 1024 }, (_, i) => (i % 5) / 5);

async function documento(c: Cenario, usuarioId: string, titulo: string) {
  return c.banco.conhecimento.gravarDocumento(
    {
      id: randomUUID(),
      usuarioId,
      fonte: "nota",
      titulo,
      url: null,
      publicadoEm: new Date(),
      hashConteudo: `${usuarioId}-${titulo}`,
    },
    [
      { id: randomUUID(), ordem: 1, texto: `segundo trecho de ${titulo}`, embedding: vetor() },
      { id: randomUUID(), ordem: 0, texto: `primeiro trecho de ${titulo}`, embedding: vetor() },
    ],
  );
}

describe("configuração do assistente", () => {
  let c: Cenario;
  let agente: BancoDoAgente;
  beforeAll(async () => {
    c = await montarCenario();
    agente = criarBancoDoAgente({ url: c.url, maximoConexoes: 2 });
  });
  afterAll(async () => {
    await agente.fechar();
    await c.encerrar();
  });

  it("sem linha, vale o padrão (API, modelo e conta do serviço)", async () => {
    expect(await agente.configGravada(c.ana.id)).toBeNull();
    expect(await c.banco.assistente.config(c.ana.id)).toEqual({
      provedor: "api",
      modelo: null,
      contaCli: null,
    });
  });

  it("grava só o que muda, por pessoa, e o agente lê a mesma configuração", async () => {
    await c.banco.assistente.salvarConfig(c.ana.id, { provedor: "cli", contaCli: "pessoal" });
    const nova = await c.banco.assistente.salvarConfig(c.ana.id, { modelo: "sonnet" });
    expect(nova).toEqual({ provedor: "cli", modelo: "sonnet", contaCli: "pessoal" });
    expect(await agente.config(c.ana.id)).toEqual(nova);
    expect((await c.banco.assistente.salvarConfig(c.ana.id, { modelo: null })).modelo).toBeNull();
    expect((await agente.config(c.beto.id)).provedor).toBe("api");
  });

  it("o agente lê os dados da pessoa sob RLS", async () => {
    expect((await agente.robos(c.ana.id)).map((r) => r.id)).toEqual([c.ana.robo.id]);
    expect(await agente.decisoes(c.beto.id)).toEqual([]);
    expect(await agente.ordens(c.ana.id)).toEqual([]);
    expect((await agente.resumo(c.ana.id, Date.now())).robosAtivos).toBe(1);
  });
});

describe("conversas do assistente", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("cria, grava mensagens, lista com prévia e devolve o histórico em ordem", async () => {
    const conversa = await c.banco.assistente.criarConversa(c.ana.id, "Primeira conversa");
    await c.banco.assistente.acrescentarMensagem(c.ana.id, conversa.id, {
      papel: "usuario",
      texto: "Como foi hoje?",
    });
    const resposta = await c.banco.assistente.acrescentarMensagem(c.ana.id, conversa.id, {
      papel: "assistente",
      texto: "Hoje o resultado foi zero.",
      fontes: [{ tipo: "nota", id: "n1", titulo: "Nota", url: "https://exemplo.com" }],
      ferramentas: [{ nome: "resumo", descricao: "Lendo o resumo" }],
      provedor: "cli",
      modelo: "sonnet",
    });
    await c.banco.assistente.acrescentarMensagem(c.ana.id, conversa.id, {
      papel: "assistente",
      texto: "pela metade",
      situacao: "erro",
      erro: "caiu",
    });
    expect(resposta).toMatchObject({ papel: "assistente", provedor: "cli", situacao: "ok" });
    const [resumo] = await c.banco.assistente.listarConversas(c.ana.id);
    expect(resumo).toMatchObject({ id: conversa.id, previa: "pela metade" });
    const completa = await c.banco.assistente.obterConversa(c.ana.id, conversa.id);
    expect(completa!.mensagens.map((m) => m.texto)).toEqual([
      "Como foi hoje?",
      "Hoje o resultado foi zero.",
      "pela metade",
    ]);
    expect(completa!.mensagens[1]!.fontes[0]!.titulo).toBe("Nota");
    expect(await c.banco.assistente.historico(c.ana.id, conversa.id, 10)).toEqual([
      { papel: "usuario", texto: "Como foi hoje?" },
      { papel: "assistente", texto: "Hoje o resultado foi zero." },
    ]);
    expect(await c.banco.assistente.historico(c.ana.id, conversa.id, 1)).toEqual([
      { papel: "assistente", texto: "Hoje o resultado foi zero." },
    ]);
  });

  it("renomeia e apaga só as conversas da própria pessoa", async () => {
    const conversa = await c.banco.assistente.criarConversa(c.ana.id, "Da Ana");
    expect(await c.banco.assistente.renomearConversa(c.beto.id, conversa.id, "invadida")).toBeNull();
    expect(await c.banco.assistente.obterConversa(c.beto.id, conversa.id)).toBeNull();
    expect(await c.banco.assistente.apagarConversa(c.beto.id, conversa.id)).toBe(false);
    expect((await c.banco.assistente.renomearConversa(c.ana.id, conversa.id, "Renomeada"))!.titulo).toBe(
      "Renomeada",
    );
    expect(await c.banco.assistente.apagarConversa(c.ana.id, conversa.id)).toBe(true);
    expect(await c.banco.assistente.obterConversa(c.ana.id, conversa.id)).toBeNull();
  });

  it("não deixa gravar mensagem na conversa de outra pessoa", async () => {
    const conversa = await c.banco.assistente.criarConversa(c.ana.id, "Só da Ana");
    await expect(
      c.banco.assistente.acrescentarMensagem(c.beto.id, conversa.id, { papel: "usuario", texto: "oi" }),
    ).rejects.toMatchObject({ codigo: "nao_encontrado" });
    const vistas = await comoUsuario(c.banco.conexao.db, c.beto.id, (tx) =>
      tx.select().from(assistenteMensagens),
    );
    expect(vistas).toEqual([]);
  });
});

describe("detalhe do conhecimento", () => {
  let c: Cenario;
  beforeAll(async () => {
    c = await montarCenario();
  });
  afterAll(async () => c.encerrar());

  it("lista com origem e número de trechos; detalhe traz os trechos em ordem", async () => {
    const { documentoId } = await documento(c, c.ana.id, "Plano de estudos");
    await c.banco.conhecimentoDetalhe.gravarOrigem(c.ana.id, documentoId, {
      origem: "arquivo",
      nomeArquivo: "plano.pdf",
      tipoArquivo: "pdf",
      bytes: 2048,
    });
    // Repetido: a origem da primeira vez fica.
    await c.banco.conhecimentoDetalhe.gravarOrigem(c.ana.id, documentoId, { origem: "link" });
    const [d] = await c.banco.conhecimentoDetalhe.listar(c.ana.id);
    expect(d).toMatchObject({ id: documentoId, origem: "arquivo", nomeArquivo: "plano.pdf", trechos: 2 });
    const detalhe = await c.banco.conhecimentoDetalhe.detalhe(c.ana.id, documentoId);
    expect(detalhe!.trechos.map((t) => t.ordem)).toEqual([0, 1]);
  });

  it("documento sem origem gravada aparece como texto (nota) ou automação (notícia)", async () => {
    await documento(c, c.beto.id, "Nota solta");
    const [d] = await c.banco.conhecimentoDetalhe.listar(c.beto.id);
    expect(d).toMatchObject({ origem: "texto", nomeArquivo: null, tipoArquivo: null });
  });

  it("uma pessoa não vê, não apaga e não marca origem no documento de outra", async () => {
    const { documentoId } = await documento(c, c.ana.id, "Segredo da Ana");
    expect(await c.banco.conhecimentoDetalhe.detalhe(c.beto.id, documentoId)).toBeNull();
    expect(await c.banco.conhecimentoDetalhe.apagar(c.beto.id, documentoId)).toBe(false);
    await expect(
      c.banco.conhecimentoDetalhe.gravarOrigem(c.beto.id, documentoId, { origem: "link" }),
    ).rejects.toThrow();
    expect((await c.banco.conhecimentoDetalhe.listar(c.beto.id)).map((d) => d.titulo)).not.toContain(
      "Segredo da Ana",
    );
  });

  it("apagar leva os trechos e a origem junto", async () => {
    const { documentoId } = await documento(c, c.ana.id, "Para apagar");
    await c.banco.conhecimentoDetalhe.gravarOrigem(c.ana.id, documentoId, { origem: "texto" });
    expect(await c.banco.conhecimentoDetalhe.apagar(c.ana.id, documentoId)).toBe(true);
    const [restos] = await c.banco.conexao.db.execute<{ n: number }>(
      sql`select (select count(*) from trechos where documento_id = ${documentoId})::int
        + (select count(*) from documentos_origem where documento_id = ${documentoId})::int as n`,
    );
    expect(restos!.n).toBe(0);
  });
});
