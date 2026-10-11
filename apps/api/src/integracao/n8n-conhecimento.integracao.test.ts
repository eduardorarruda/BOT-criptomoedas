import { assinar } from "@zentrade/contratos";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embeddingsFalsos, montarApi, SEGREDO_WEBHOOK, type Api } from "./ajuda.js";

const DONA = "0b5c2f8e-6a1d-4f3b-8c2e-9d7a6b5c4e3f";

/** Instalação com várias pessoas: o conhecimento do n8n vai para N8N_USUARIO_ID. */
describe("conhecimento do n8n com N8N_USUARIO_ID", () => {
  let api: Api;

  const enviar = (objeto: unknown) => {
    const corpo = JSON.stringify(objeto);
    return api.app.inject({
      method: "POST",
      url: "/webhooks/n8n/conhecimento",
      headers: {
        "content-type": "application/json",
        "x-zentrade-assinatura": assinar(corpo, SEGREDO_WEBHOOK, api.relogio.t),
      },
      payload: corpo,
    });
  };
  const noticia = () => ({
    fonte: "noticia",
    titulo: "Nova listagem",
    url: "https://exemplo.com/listagem",
    publicadoEm: api.relogio.t,
    texto: "A corretora listou um par novo.",
  });

  beforeAll(async () => {
    api = await montarApi({ embeddings: embeddingsFalsos, ambiente: { N8N_USUARIO_ID: DONA } });
  });
  afterAll(async () => api.encerrar());

  it("recusa quando N8N_USUARIO_ID não é de ninguém", async () => {
    const r = await enviar(noticia());
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ erro: { codigo: "n8n_usuario_inexistente" } });
  });

  it("entrega à pessoa configurada, mesmo com outras cadastradas, e deduplica", async () => {
    await api.banco.conexao.sql`
      insert into usuarios (id, email, nome, senha_hash) values (${DONA}, 'dona@exemplo.com', 'Dona', 'x')`;
    const outra = await api.pessoa("outra@exemplo.com");
    api.relogio.t += 1000;
    const r = await enviar(noticia());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ titulo: "Nova listagem", novo: true });
    expect((await api.banco.conhecimento.listar(DONA)).map((d) => d.titulo)).toEqual(["Nova listagem"]);
    expect(await api.banco.conhecimento.listar(outra.id)).toEqual([]);
    api.relogio.t += 1000;
    expect((await enviar(noticia())).statusCode).toBe(200);
  });
});
