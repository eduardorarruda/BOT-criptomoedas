import { afterEach, describe, expect, it } from "vitest";
import {
  carregarFusoDaInstancia,
  definirFusoDaInstancia,
  fusoDaInstancia,
  nomeDoFusoDaInstancia,
} from "./fuso";

afterEach(() => definirFusoDaInstancia("America/Sao_Paulo"));

describe("fuso da instância na tela", () => {
  it("começa no horário de Brasília (o padrão do ZENTRADE_FUSO)", () => {
    expect(fusoDaInstancia()).toBe("America/Sao_Paulo");
    expect(nomeDoFusoDaInstancia()).toBe("horário de Brasília");
  });

  it("usa o fuso que a API informa e ignora um inválido", () => {
    definirFusoDaInstancia("America/New_York");
    expect(fusoDaInstancia()).toBe("America/New_York");
    definirFusoDaInstancia("Marte/Olympus");
    expect(fusoDaInstancia()).toBe("America/New_York");
  });

  it("lê da config pública; se a API falhar, fica o padrão", async () => {
    await carregarFusoDaInstancia(async () => ({ fuso: "Europe/Lisbon" }));
    expect(fusoDaInstancia()).toBe("Europe/Lisbon");
    definirFusoDaInstancia("America/Sao_Paulo");
    await carregarFusoDaInstancia(async () => {
      throw new Error("fora do ar");
    });
    expect(fusoDaInstancia()).toBe("America/Sao_Paulo");
  });
});
