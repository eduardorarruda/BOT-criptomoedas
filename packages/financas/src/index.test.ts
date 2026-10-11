import { describe, expect, it } from "vitest";
import * as financas from "./index.js";

describe("@zentrade/financas", () => {
  it("carrega", () => {
    expect(financas).toBeTypeOf("object");
  });
});
