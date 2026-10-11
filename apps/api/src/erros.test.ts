import { ErroDados } from "@zentrade/banco";
import { describe, expect, it } from "vitest";
import { corpoDoErro, ErroApi, naoEncontrado } from "./erros.js";

describe("erros no formato do contrato", () => {
  it("erro da API vira { erro: { codigo, mensagem } } com o status certo", () => {
    expect(corpoDoErro(naoEncontrado("robô"))).toEqual({
      status: 404,
      corpo: { erro: { codigo: "nao_encontrado", mensagem: "robô não encontrado; confira o id" } },
    });
  });

  it("erros do banco ganham status HTTP", () => {
    expect(corpoDoErro(new ErroDados("conflito", "já existe")).status).toBe(409);
    expect(corpoDoErro(new ErroDados("invalido", "x")).status).toBe(400);
    expect(corpoDoErro(new ErroDados("expirada", "x")).status).toBe(409);
    expect(corpoDoErro(new ErroDados("nao_encontrado", "x")).status).toBe(404);
  });

  it("erro inesperado vira 500 sem detalhe interno", () => {
    const r = corpoDoErro(new Error("senha do banco: hunter2"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.corpo)).not.toContain("hunter2");
  });

  it("erro 4xx do Fastify (JSON quebrado, corpo grande) vira mensagem em português", () => {
    const e = Object.assign(new Error("Body is not valid JSON"), {
      statusCode: 400,
      code: "FST_ERR_CTP_INVALID_JSON_BODY",
    });
    expect(corpoDoErro(e)).toMatchObject({ status: 400, corpo: { erro: { codigo: "requisicao_invalida" } } });
    expect(corpoDoErro(new ErroApi(429, "muitas_tentativas", "calma")).status).toBe(429);
  });
});
