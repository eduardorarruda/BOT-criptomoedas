import { describe, expect, it } from "vitest";
import { grupoDe, NAVEGACAO } from "./navegacao";

describe("navegação", () => {
  it("cada rota aparece uma vez só no menu", () => {
    const rotas = NAVEGACAO.flatMap((g) => g.itens.map((i) => i.para));
    expect(new Set(rotas).size).toBe(rotas.length);
  });

  it("acha o grupo do caminho, inclusive em subpáginas", () => {
    expect(grupoDe("/")).toBe("Acompanhar");
    expect(grupoDe("/robos")).toBe("Construir");
    expect(grupoDe("/imobiliario/novo")).toBe("Finanças");
    expect(grupoDe("/assistente/configuracoes")).toBe("Acompanhar");
    expect(grupoDe("/tokens")).toBe("Proteger");
  });

  it("não confunde prefixos parecidos nem inventa grupo", () => {
    expect(grupoDe("/robosx")).toBeUndefined();
    expect(grupoDe("/nada")).toBeUndefined();
  });
});
