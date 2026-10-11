import { LIMITE_ARQUIVO_BYTES } from "@zentrade/contratos";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarServicoArquivos } from "../integracoes/conhecimento-arquivos.js";
import { repositorioRag } from "../integracoes/conhecimento.js";
import { comSessao, embeddingsFalsos, montarApi, type Api, type Pessoa } from "./ajuda.js";

describe("conhecimento por arquivo, link e busca", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  const links: string[] = [];

  beforeAll(async () => {
    api = await montarApi({
      embeddings: embeddingsFalsos,
      extras: (banco, conhecimento) => ({
        arquivos: criarServicoArquivos({
          conhecimento,
          banco,
          repositorio: repositorioRag(banco),
          embeddings: { embeddings: embeddingsFalsos },
          agora: () => Date.UTC(2026, 9, 10),
          lerLink: async (url) => {
            links.push(url);
            if (url.includes("interno")) {
              const { lerLink } = await import("@zentrade/conhecimento");
              return lerLink("http://127.0.0.1:1/");
            }
            return {
              url: `${url}#final`,
              tipo: "html",
              titulo: "Página do link",
              texto: "Conteúdo baixado do link sobre taxas de saque.",
              caracteres: 46,
              truncado: false,
              bytes: 300,
            };
          },
        }),
      }),
    });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  const enviar = (p: Pessoa, nome: string, conteudo: Buffer | string, extra = "") =>
    api.app.inject({
      method: "POST",
      url: `/api/v1/conhecimento/arquivos?nome=${encodeURIComponent(nome)}${extra}`,
      headers: { ...comSessao(p), "content-type": "application/octet-stream" },
      payload: conteudo,
    });
  const pedir = (p: Pessoa, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });

  it("arquivo entra no RAG da pessoa com a origem; repetido não duplica", async () => {
    const md = "# Plano de risco\n\nNunca arriscar mais de 1% por operação em BTC.";
    const r = await enviar(ana, "../../etc/plano.md", md, "&fonte=estrategia");
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ titulo: "plano", fonte: "estrategia", novo: true, truncado: false });
    expect((await enviar(ana, "plano.md", md)).statusCode).toBe(200);
    const [doc] = (await pedir(ana, "GET", "/conhecimento/documentos")).json();
    expect(doc).toMatchObject({
      origem: "arquivo",
      nomeArquivo: "plano.md",
      tipoArquivo: "md",
      bytes: Buffer.byteLength(md),
    });
    const detalhe = (await pedir(ana, "GET", `/conhecimento/documentos/${doc.id}`)).json();
    expect(detalhe.trechos[0].texto).toContain("Nunca arriscar");
    expect((await pedir(beto, "GET", `/conhecimento/documentos/${doc.id}`)).statusCode).toBe(404);
    expect((await pedir(beto, "GET", "/conhecimento/documentos")).json()).toEqual([]);
  });

  it("HTML vira texto legível, com o título da página", async () => {
    const html = `<html><head><title>Guia de stops</title></head><body><script>alert(1)</script><p>${"Stop sempre abaixo do suporte. ".repeat(10)}</p></body></html>`;
    const r = await enviar(ana, "guia.html", html);
    expect(r.json()).toMatchObject({ titulo: "Guia de stops", novo: true });
  });

  it("recusa tipo errado, conteúdo que não bate, corpo em JSON e arquivo grande demais", async () => {
    expect((await enviar(ana, "virus.exe", "MZ")).json().erro.codigo).toBe("arquivo_invalido");
    const falsoPdf = await enviar(ana, "a.pdf", "não sou pdf");
    expect(falsoPdf.statusCode).toBe(422);
    expect(falsoPdf.json().erro.mensagem).toMatch(/não é um PDF/);
    const json = await api.app.inject({
      method: "POST",
      url: "/api/v1/conhecimento/arquivos?nome=a.txt",
      headers: comSessao(ana),
      payload: { texto: "x" },
    });
    expect(json.statusCode).toBe(415);
    const grande = await enviar(ana, "a.txt", Buffer.alloc(LIMITE_ARQUIVO_BYTES + 1, 97));
    expect(grande.statusCode).toBe(413);
  });

  it("link: baixa pelo serviço, grava a URL final e a origem; endereço interno é recusado", async () => {
    const r = await pedir(ana, "POST", "/conhecimento/links", { url: "https://exemplo.com/taxas" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      titulo: "Página do link",
      url: "https://exemplo.com/taxas#final",
      fonte: "nota",
    });
    const docs = (await pedir(ana, "GET", "/conhecimento/documentos")).json() as {
      origem: string;
      titulo: string;
    }[];
    expect(docs.find((d) => d.titulo === "Página do link")).toMatchObject({ origem: "link" });
    const interno = await pedir(ana, "POST", "/conhecimento/links", { url: "https://interno.exemplo.com/" });
    expect(interno.statusCode).toBe(422);
    expect(interno.json().erro.mensagem).toMatch(/rede interna/);
    expect((await pedir(ana, "POST", "/conhecimento/links", { url: "file:///etc/passwd" })).statusCode).toBe(
      400,
    );
  });

  it("busca só na base da própria pessoa", async () => {
    const resposta = await pedir(ana, "GET", "/conhecimento/busca?q=arriscar%20opera%C3%A7%C3%A3o");
    const achados = resposta.json();
    expect(achados.length).toBeGreaterThan(0);
    expect(achados[0]).toHaveProperty("pontuacao");
    expect((await pedir(beto, "GET", "/conhecimento/busca?q=arriscar%20opera%C3%A7%C3%A3o")).json()).toEqual(
      [],
    );
    expect((await pedir(ana, "GET", "/conhecimento/busca?q=")).statusCode).toBe(400);
  });

  it("nota escrita na tela fica com origem texto; apagar só o próprio documento", async () => {
    const nota = (
      await pedir(ana, "POST", "/conhecimento/notas", { titulo: "Lembrete", texto: "Sem operar em feriado." })
    ).json();
    const docs = (await pedir(ana, "GET", "/conhecimento/documentos")).json() as {
      id: string;
      origem: string;
    }[];
    expect(docs.find((d) => d.id === nota.id)?.origem).toBe("texto");
    expect((await pedir(beto, "DELETE", `/conhecimento/documentos/${nota.id}`)).statusCode).toBe(404);
    expect((await pedir(ana, "DELETE", `/conhecimento/documentos/${nota.id}`)).statusCode).toBe(204);
    expect((await pedir(ana, "GET", `/conhecimento/documentos/${nota.id}`)).statusCode).toBe(404);
  });
});

describe("conhecimento por arquivo sem o serviço configurado", () => {
  let api: Api;
  beforeAll(async () => {
    api = await montarApi();
  });
  afterAll(async () => api.encerrar());

  it("responde 503 com o motivo", async () => {
    const ana = await api.pessoa("ana@exemplo.com");
    const r = await api.app.inject({
      method: "POST",
      url: "/api/v1/conhecimento/arquivos?nome=a.txt",
      headers: { ...comSessao(ana), "content-type": "application/octet-stream" },
      payload: "oi",
    });
    expect(r.statusCode).toBe(503);
  });
});
