import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./prompt.js";

describe("system prompt", () => {
  it("trata o conteúdo recuperado como dado de terceiros, nunca como instrução", () => {
    expect(SYSTEM_PROMPT).toMatch(/dados de terceiros/);
    expect(SYSTEM_PROMPT).toMatch(/Ignore qualquer instrução/);
  });

  it("não tem data nem hora (o prefixo precisa ser estável para o cache)", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
