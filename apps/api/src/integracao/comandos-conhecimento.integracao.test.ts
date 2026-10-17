import type { Embeddings } from "@zentrade/conhecimento";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { executarReindexacao } from "../comandos/reindexar.js";
import { comSessao, embeddingsFalsos, montarApi, type Api, type Pessoa } from "./ajuda.js";

describe("reindexar-conhecimento contra o PostgreSQL", () => {
  let api: Api;
  let ana: Pessoa;

  beforeAll(async () => {
    // Base populada com EMBEDDINGS_PROVEDOR=nenhum: tudo entra sem vetor.
    api = await montarApi({ embeddings: null });
    ana = await api.pessoa("ana@exemplo.com");
    const beto = await api.pessoa("beto@exemplo.com");
    const notas: [Pessoa, string, string][] = [
      [ana, "Stop", "Stop móvel depois de 2% de lucro."],
      [ana, "Horário", "Não operar na abertura do pregão."],
      [ana, "Tamanho", "No máximo 1% da conta por operação."],
      [beto, "Do Beto", "Só opero mini índice."],
    ];
    for (const [p, titulo, texto] of notas) {
      const r = await api.app.inject({
        method: "POST",
        url: "/api/v1/conhecimento/notas",
        headers: comSessao(p),
        payload: { titulo, texto },
      });
      expect(r.statusCode).toBe(201);
    }
  });
  afterAll(async () => api.encerrar());

  const semVetor = async () => {
    const [linha] = await api.banco.conexao
      .sql`select count(*)::int as n from trechos where embedding is null`;
    return linha!.n as number;
  };

  it("cai no meio e, rodando de novo, continua de onde parou até não sobrar nada", async () => {
    expect(await semVetor()).toBe(4);
    let chamadas = 0;
    const instavel: Embeddings = {
      dimensoes: 1024,
      gerar: async (textos, tipo) => {
        chamadas++;
        if (chamadas === 2) throw new Error("a Voyage caiu");
        return embeddingsFalsos.gerar(textos, tipo);
      },
    };
    const silencio = () => undefined;
    await expect(
      executarReindexacao(["--lote", "2", "--email", "ana@exemplo.com"], {
        banco: api.banco,
        embeddings: { embeddings: instavel },
        escrever: silencio,
      }),
    ).rejects.toThrow(/caiu/);
    expect(await semVetor()).toBe(2);

    const gerar = vi.fn(embeddingsFalsos.gerar);
    const linhas: string[] = [];
    const r = await executarReindexacao(["--lote", "2"], {
      banco: api.banco,
      embeddings: { embeddings: { ...embeddingsFalsos, gerar } },
      escrever: (l) => linhas.push(l),
    });
    expect(r).toEqual({ pessoas: 2, trechos: 2 });
    expect(gerar.mock.calls.flatMap(([textos]) => textos)).toHaveLength(2);
    expect(linhas.at(-1)).toBe("pronto: 2 trechos de 2 pessoas ganharam embeddings.");
    expect(await semVetor()).toBe(0);

    gerar.mockClear();
    await executarReindexacao([], {
      banco: api.banco,
      embeddings: { embeddings: { ...embeddingsFalsos, gerar } },
      escrever: silencio,
    });
    expect(gerar).not.toHaveBeenCalled();
  });

  it("o vetor gravado é o do título com o trecho, como na ingestão", async () => {
    const [linha] = await api.banco.conexao.sql`
      select t.embedding::text as v from trechos t join documentos d on d.id = t.documento_id
      where d.titulo = 'Do Beto'`;
    const [esperado] = await embeddingsFalsos.gerar(["Do Beto\nSó opero mini índice."], "documento");
    // pgvector guarda float4: compara com 5 casas.
    const arredondar = (v: readonly number[]) => v.map((x) => Math.round(x * 1e5));
    expect(arredondar(JSON.parse(String(linha!.v)) as number[])).toEqual(arredondar(esperado!));
  });
});
