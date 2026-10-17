import { fileURLToPath } from "node:url";
import type { Embeddings } from "@zentrade/conhecimento";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { executarImportacao } from "../comandos/importar.js";
import { executarReindexacao } from "../comandos/reindexar.js";
import { criarServicoArquivos, type ServicoArquivos } from "../integracoes/conhecimento-arquivos.js";
import { repositorioRag } from "../integracoes/conhecimento.js";
import { comSessao, embeddingsFalsos, montarApi, type Api, type Pessoa } from "./ajuda.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/importar-conhecimento", import.meta.url));

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

describe("importar-conhecimento contra o PostgreSQL (EMBEDDINGS_PROVEDOR=nenhum)", () => {
  let api: Api;
  let ana: Pessoa;
  let arquivos: ServicoArquivos;

  beforeAll(async () => {
    api = await montarApi({
      embeddings: null,
      extras: (banco, conhecimento) => {
        arquivos = criarServicoArquivos({
          conhecimento,
          banco,
          repositorio: repositorioRag(banco),
          embeddings: { embeddings: null },
          agora: () => Date.UTC(2026, 9, 17),
        });
        return { arquivos };
      },
    });
    ana = await api.pessoa("ana@exemplo.com");
    await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  const importar = async (email: string, extra: string[] = []) => {
    const linhas: string[] = [];
    const resumo = await executarImportacao(["--email", email, "--pasta", FIXTURES, ...extra], {
      banco: api.banco,
      arquivos,
      embeddings: { embeddings: null },
      escrever: (l) => linhas.push(l),
    });
    return { resumo, linhas };
  };

  it("importa a pasta pela mesma ingestão do envio, com a origem, e acha sem acento", async () => {
    const { resumo, linhas } = await importar("ana@exemplo.com", ["--fonte", "estrategia"]);
    expect(resumo).toEqual({ importados: 3, trechos: 3, duplicados: 1, ignorados: 1, falhas: 1 });
    expect(linhas).toEqual([
      "- imagem.png: ignorado (tipo não suportado: .png)",
      expect.stringMatching(/^! quebrado\.pdf: falhou \(.*não é um PDF/),
      "+ regras-de-risco.txt: importado (1 trecho)",
      "+ reversao-a-media.md: importado (1 trecho)",
      "= subpasta/reversao-copia.md: já existe (mesmo conteúdo)",
      "+ taxas.html: importado (1 trecho)",
      "resumo: 3 importados (3 trechos), 1 já existia, 1 ignorado, 1 falha. Busca só por palavras: " +
        "rode reindexar-conhecimento quando configurar um provedor de embeddings.",
    ]);

    const docs = (
      await api.app.inject({ method: "GET", url: "/api/v1/conhecimento/documentos", headers: comSessao(ana) })
    ).json() as { titulo: string; fonte: string; origem: string; nomeArquivo: string }[];
    expect(docs.map((d) => [d.titulo, d.fonte, d.origem, d.nomeArquivo]).sort()).toEqual([
      ["Taxas da corretora", "estrategia", "arquivo", "taxas.html"],
      ["regras-de-risco", "estrategia", "arquivo", "regras-de-risco.txt"],
      ["reversao-a-media", "estrategia", "arquivo", "reversao-a-media.md"],
    ]);

    const busca = await api.app.inject({
      method: "GET",
      url: "/api/v1/conhecimento/busca?q=acoes%20mini%20indice",
      headers: comSessao(ana),
    });
    expect(
      busca
        .json()
        .map((r: { titulo: string }) => r.titulo)
        .sort(),
    ).toEqual(["Taxas da corretora", "reversao-a-media"]);
  });

  it("rodar de novo não duplica; outra pessoa importa a mesma pasta para a própria base", async () => {
    const denovo = await importar("ana@exemplo.com", ["--fonte", "estrategia"]);
    expect(denovo.resumo).toMatchObject({ importados: 0, duplicados: 4 });
    const beto = await importar("beto@exemplo.com");
    expect(beto.resumo).toMatchObject({ importados: 3, duplicados: 1 });
    const [linha] = await api.banco.conexao.sql`select count(*)::int as n from documentos`;
    expect(linha!.n).toBe(6);
  });
});
