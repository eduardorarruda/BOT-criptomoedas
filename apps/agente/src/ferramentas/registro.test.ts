import { describe, expect, it } from "vitest";
import { RegistroFontes } from "./registro.js";

describe("RegistroFontes", () => {
  it("mantém só as fontes citadas que alguma ferramenta devolveu", () => {
    const r = new RegistroFontes();
    r.registrar({ tipo: "nota", id: "n1", titulo: "Nota" });
    const { fontes, removidas } = r.filtrar([
      { tipo: "nota", id: "n1", titulo: "Nota" },
      { tipo: "noticia", id: "inventada", titulo: "Não existe" },
    ]);
    expect(fontes.map((f) => f.id)).toEqual(["n1"]);
    expect(removidas).toBe(1);
  });
});
