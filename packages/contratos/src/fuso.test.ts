import { describe, expect, it } from "vitest";
import { ConfigPublicaEsquema, FusoEsquema, FusoInstanciaEsquema } from "./esquemas.js";

describe("fuso da instância (ZENTRADE_FUSO)", () => {
  it("sem a variável, vale o horário de Brasília", () => {
    expect(FusoInstanciaEsquema.parse(undefined)).toBe("America/Sao_Paulo");
  });

  it("aceita um nome IANA e devolve o nome canônico", () => {
    expect(FusoInstanciaEsquema.parse("America/New_York")).toBe("America/New_York");
    expect(FusoInstanciaEsquema.parse(" america/sao_paulo ")).toBe("America/Sao_Paulo");
    expect(FusoInstanciaEsquema.parse("UTC")).toBe("UTC");
  });

  it("recusa fuso inválido, explicando o que usar", () => {
    const r = FusoInstanciaEsquema.safeParse("Brasil/Brasilia");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/fuso desconhecido: "Brasil\/Brasilia".*America\/Sao_Paulo/);
    expect(FusoEsquema.safeParse("-03:00").success).toBe(false);
  });

  it("vai na config pública para a tela (com o padrão se faltar)", () => {
    const base = { controlador: null, encarregado: null, versao: "0.1.0" };
    expect(ConfigPublicaEsquema.parse({ ...base, fuso: "America/New_York" }).fuso).toBe("America/New_York");
    expect(ConfigPublicaEsquema.parse(base).fuso).toBe("America/Sao_Paulo");
    expect(ConfigPublicaEsquema.safeParse({ ...base, fuso: "Marte/Olympus" }).success).toBe(false);
  });
});
