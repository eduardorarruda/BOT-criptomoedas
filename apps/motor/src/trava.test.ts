import { describe, expect, it } from "vitest";
import { Trava } from "./trava.js";

describe("trava por robô", () => {
  it("nunca roda duas tarefas ao mesmo tempo, na ordem de chegada", async () => {
    const t = new Trava();
    const log: string[] = [];
    let emAndamento = 0;
    const tarefa = (nome: string, ms: number) => async () => {
      emAndamento++;
      expect(emAndamento).toBe(1);
      log.push(`início ${nome}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`fim ${nome}`);
      emAndamento--;
      return nome;
    };
    const resultados = await Promise.all([t.executar(tarefa("a", 20)), t.executar(tarefa("b", 1))]);
    expect(resultados).toEqual(["a", "b"]);
    expect(log).toEqual(["início a", "fim a", "início b", "fim b"]);
  });

  it("uma tarefa que falha devolve o erro a quem chamou e não trava a fila", async () => {
    const t = new Trava();
    await expect(t.executar(() => Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    await expect(t.executar(() => Promise.resolve(1))).resolves.toBe(1);
    await t.ocioso();
  });
});
