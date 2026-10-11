import { describe, expect, it } from "vitest";
import { assinarConsulta } from "./assinatura.js";

describe("assinatura HMAC-SHA256 da Binance", () => {
  it("reproduz o exemplo oficial da documentação da API spot", () => {
    // Chave de exemplo publicada na documentação da Binance, não é segredo de ninguém.
    const segredo = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j"; // gitleaks:allow
    const consulta =
      "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559";
    expect(assinarConsulta(consulta, segredo)).toBe(
      "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71",
    );
  });
});
