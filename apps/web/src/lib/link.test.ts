import { describe, expect, it } from "vitest";
import { linkSeguro } from "./link";

describe("linkSeguro", () => {
  it("só devolve endereços http(s)", () => {
    expect(linkSeguro("https://exemplo.com/a")).toBe("https://exemplo.com/a");
    expect(linkSeguro("http://exemplo.com")).toBe("http://exemplo.com/");
  });

  it("recusa javascript:, data:, relativos e lixo", () => {
    for (const u of [
      "javascript:alert(1)",
      " JAVASCRIPT:alert(1)",
      "data:text/html,x",
      "/api/v1",
      "nada",
      "",
      null,
      undefined,
    ]) {
      expect(linkSeguro(u)).toBeNull();
    }
  });
});
