import { describe, expect, it, vi } from "vitest";
import { sha256 } from "../seguranca/tokens.js";
import { criarTokenPorEmail } from "./token.js";

function montar() {
  const criados: { usuarioId: string; nome: string; escopo: string; hash: string }[] = [];
  const banco = {
    usuarios: {
      porEmail: vi.fn(async (email: string) => (email === "ana@exemplo.com" ? { id: "u-ana" } : null)),
    },
    tokens: {
      criar: vi.fn(async (usuarioId: string, t: { nome: string; escopo: string; hash: string }) => {
        criados.push({ usuarioId, ...t });
        return { id: "t1", nome: t.nome, escopo: t.escopo };
      }),
    },
  };
  return { banco, criados };
}

describe("criar-token (operador da instância)", () => {
  it("cria na conta da pessoa, guarda só o hash e devolve o token uma vez", async () => {
    const { banco, criados } = montar();
    const r = await criarTokenPorEmail(
      ["--email", "ana@exemplo.com", "--nome", "testes", "--escopo", "operar"],
      banco,
    );
    expect(r.token).toMatch(/^zt_/);
    expect(criados).toEqual([
      { usuarioId: "u-ana", nome: "testes", escopo: "operar", hash: sha256(r.token) },
    ]);
    expect(JSON.stringify(criados)).not.toContain(r.token);
  });

  it("padrão: só leitura e nome 'terminal'", async () => {
    const { banco, criados } = montar();
    await criarTokenPorEmail(["--email", "ana@exemplo.com"], banco);
    expect(criados[0]).toMatchObject({ nome: "terminal", escopo: "leitura" });
  });

  it("e-mail desconhecido ou escopo inválido: erro claro, nada criado", async () => {
    const { banco, criados } = montar();
    await expect(criarTokenPorEmail(["--email", "x@exemplo.com"], banco)).rejects.toThrow(
      /nenhuma pessoa com o e-mail x@exemplo.com/,
    );
    await expect(
      criarTokenPorEmail(["--email", "ana@exemplo.com", "--escopo", "admin"], banco),
    ).rejects.toThrow(/leitura ou operar/);
    expect(criados).toEqual([]);
  });
});
