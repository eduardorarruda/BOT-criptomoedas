import { describe, expect, it } from "vitest";
import { campo, validarBusca } from "./esquemas";

const esquema = {
  q: campo.busca(),
  tipo: campo.lista(["CDB", "LCI", "LCA"] as const),
  visao: campo.opcao(["cartoes", "tabela"] as const),
  saldo: campo.ligado(),
  de: campo.dia(),
  pagina: campo.pagina(),
};
const validar = validarBusca(esquema);

describe("parâmetros da URL", () => {
  it("aceita o que é válido e normaliza a lista", () => {
    expect(
      validar({ q: " btc ", tipo: "LCI,CDB", visao: "tabela", saldo: true, de: "2026-10-01", pagina: 3 }),
    ).toEqual({ q: "btc", tipo: "CDB,LCI", visao: "tabela", saldo: true, de: "2026-10-01", pagina: 3 });
  });

  it("descarta o que é inválido sem quebrar a página", () => {
    expect(
      validar({ q: "", tipo: "XYZ", visao: "pizza", saldo: "talvez", de: "2026-13-40", pagina: -2 }),
    ).toEqual({});
  });

  it("número na busca vira texto (o roteador lê '123' como número)", () => {
    expect(validar({ q: 2031 }).q).toBe("2031");
  });

  it("corta busca longa demais", () => {
    expect(validar({ q: "x".repeat(500) }).q).toHaveLength(80);
  });

  it("aceita '1' e 'true' como ligado", () => {
    expect(validar({ saldo: "1" }).saldo).toBe(true);
    expect(validar({ saldo: "true" }).saldo).toBe(true);
    expect(validar({ saldo: false }).saldo).toBeUndefined();
  });

  it("página 1 é o padrão e some da URL", () => {
    expect(validar({ pagina: 1 }).pagina).toBeUndefined();
    expect(validar({ pagina: "4" }).pagina).toBe(4);
  });
});

describe("lista livre (ids e símbolos que vêm da API)", () => {
  const validarIds = validarBusca({ robo: campo.listaLivre(/^[a-z0-9-]{1,64}$/) });

  it("mantém o que tem o formato, sem repetir, e descarta o resto", () => {
    expect(validarIds({ robo: "r-btc,R SOL,r-btc,r-eth" }).robo).toBe("r-btc,r-eth");
    expect(validarIds({ robo: "<script>" }).robo).toBeUndefined();
  });

  it("aceita no máximo 20 valores", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => `r-${i}`).join(",");
    expect(validarIds({ robo: muitos }).robo?.split(",")).toHaveLength(20);
  });
});
