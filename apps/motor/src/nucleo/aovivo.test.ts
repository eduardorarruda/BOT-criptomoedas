import { describe, expect, it } from "vitest";
import { montarCenario } from "../teste/cenario.js";
import { concluirAnalise, iniciarAnalise, publicarPosicao } from "./aovivo.js";

describe("eventos ao vivo do núcleo", () => {
  it("posição sem leitura das execuções: registra a falha e não publica nem lança", async () => {
    const c = montarCenario();
    c.deps.ordens.execucoes = () => Promise.reject(new Error("banco fora"));
    await expect(publicarPosicao(c.deps, c.robo)).resolves.toBeUndefined();
    expect(c.eventos.doTipo("posicao")).toEqual([]);
    expect(c.erros.map((e) => e.msg)).toContain("falha ao ler a posição para publicar");
  });

  it("cada análise tem um id próprio, e o fim usa o mesmo id do início", async () => {
    const c = montarCenario();
    const a = await iniciarAnalise(c.deps, c.robo);
    const b = await iniciarAnalise(c.deps, c.robo);
    expect(a).not.toBe(b);
    await concluirAnalise(c.deps, c.robo, a, { tipo: "falhou", motivo: "fora do ar" });
    expect(c.eventos.doTipo("analise").at(-1)).toEqual({
      tipo: "analise",
      analiseId: a,
      roboId: "r1",
      concluida: true,
      resultado: "falhou",
    });
  });
});
