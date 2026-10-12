import { describe, expect, it } from "vitest";
import { idClienteDe, idsProtecaoDe } from "./id-cliente.js";

describe("idCliente da ordem", () => {
  it("é determinístico, curto e só com caracteres aceitos pela Binance", () => {
    const id = idClienteDe("3f2a7c1e-0000-4000-8000-1234567890ab");
    expect(id).toBe(idClienteDe("3f2a7c1e-0000-4000-8000-1234567890ab"));
    expect(id).toMatch(/^[a-zA-Z0-9-_]{1,36}$/);
    expect(idClienteDe("outra")).not.toBe(id);
  });
});

describe("ids da proteção na corretora", () => {
  it("OCO: lista e pernas diferentes entre si, aceitos pela Binance e estáveis para a mesma chave", () => {
    const ids = idsProtecaoDe("chave-1", true);
    expect(new Set([ids.lista, ids.stop, ids.alvo]).size).toBe(3);
    for (const id of [ids.lista, ids.stop, ids.alvo]) expect(id).toMatch(/^[a-zA-Z0-9-_]{1,36}$/);
    expect(idsProtecaoDe("chave-1", true)).toEqual(ids);
    expect(idsProtecaoDe("chave-2", true).stop).not.toBe(ids.stop);
  });

  it("stop sozinho: a lista é o próprio stop e não há alvo", () => {
    const ids = idsProtecaoDe("chave-1", false);
    expect(ids.lista).toBe(ids.stop);
    expect(ids.alvo).toBeUndefined();
  });
});
