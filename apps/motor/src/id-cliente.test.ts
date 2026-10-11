import { describe, expect, it } from "vitest";
import { idClienteDe } from "./id-cliente.js";

describe("idCliente da ordem", () => {
  it("é determinístico, curto e só com caracteres aceitos pela Binance", () => {
    const id = idClienteDe("3f2a7c1e-0000-4000-8000-1234567890ab");
    expect(id).toBe(idClienteDe("3f2a7c1e-0000-4000-8000-1234567890ab"));
    expect(id).toMatch(/^[a-zA-Z0-9-_]{1,36}$/);
    expect(idClienteDe("outra")).not.toBe(id);
  });
});
