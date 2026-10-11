import { describe, expect, it } from "vitest";
import { criarLog, resumirErro } from "./log.js";

describe("logs sem segredo", () => {
  it("esconde credenciais e campos sensíveis", () => {
    const linhas: string[] = [];
    const log = criarLog("info", { write: (l: string) => void linhas.push(l) });
    log.info(
      {
        req: { headers: { authorization: "Bearer zt_segredo", cookie: "zt_sessao=abc" } },
        corpo: { senha: "hunter2", apiSecret: "s3" },
      },
      "teste",
    );
    const texto = linhas.join("");
    expect(texto).not.toContain("zt_segredo");
    expect(texto).not.toContain("hunter2");
    expect(texto).not.toContain('s3"');
    expect(texto).toContain("[oculto]");
  });

  it("erro sai sem pilha: tipo, mensagem e código", () => {
    const erro = Object.assign(new TypeError("quebrou"), { code: "E_X" });
    expect(resumirErro(erro)).toEqual({ tipo: "TypeError", mensagem: "quebrou", codigo: "E_X" });
    expect(resumirErro("texto")).toEqual({ mensagem: "texto" });
    const linhas: string[] = [];
    criarLog("info", { write: (l: string) => void linhas.push(l) }).error({ err: new Error("x") }, "falhou");
    expect(linhas.join("")).not.toContain("at ");
  });
});
