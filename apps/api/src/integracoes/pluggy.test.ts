import { describe, expect, it } from "vitest";
import { criarClientePluggy, ErroPluggy, mensagemPluggy } from "./pluggy.js";
import { lerConfigPluggy } from "./pluggy-config.js";

const CONFIG = {
  clientId: "11111111-2222-4333-8444-555555555555",
  clientSecret: "segredo-de-teste-123",
  url: "https://pluggy.teste",
};
const ITEM = "4b6a1a5e-8e0a-4c55-9f43-3b8f3c1d2e7a";

interface Pedido {
  readonly url: string;
  readonly metodo: string;
  readonly cabecalhos: Record<string, string>;
  readonly corpo: unknown;
}

/** Pluggy falsa: responde por rota; nada sai para a rede. */
function pluggyFalsa(rotas: Record<string, (p: Pedido) => Response>) {
  const pedidos: Pedido[] = [];
  const buscar = async (url: string | URL | Request, init?: RequestInit) => {
    const p: Pedido = {
      url: String(url),
      metodo: init?.method ?? "GET",
      cabecalhos: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})),
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    pedidos.push(p);
    const chave = `${p.metodo} ${new URL(p.url).pathname}`;
    const rota = rotas[chave];
    return rota ? rota(p) : new Response("{}", { status: 404 });
  };
  return { buscar: buscar as typeof fetch, pedidos };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const auth = () => json({ apiKey: "chave-api-1" });

describe("configuração da Pluggy", () => {
  it("sem as duas variáveis, desligada; com as duas, ligada; com uma só, erro", () => {
    expect(lerConfigPluggy({})).toBeNull();
    expect(lerConfigPluggy({ PLUGGY_CLIENT_ID: "", PLUGGY_CLIENT_SECRET: "" })).toBeNull();
    expect(
      lerConfigPluggy({ PLUGGY_CLIENT_ID: CONFIG.clientId, PLUGGY_CLIENT_SECRET: CONFIG.clientSecret }),
    ).toEqual({
      clientId: CONFIG.clientId,
      clientSecret: CONFIG.clientSecret,
      url: "https://api.pluggy.ai",
    });
    expect(() => lerConfigPluggy({ PLUGGY_CLIENT_ID: CONFIG.clientId })).toThrow(/juntos/);
    expect(() =>
      lerConfigPluggy({ PLUGGY_CLIENT_ID: "x", PLUGGY_CLIENT_SECRET: CONFIG.clientSecret }),
    ).toThrow(/UUID/);
  });
});

describe("cliente da Pluggy (fetch simulado)", () => {
  it("autentica uma vez, manda x-api-key e pede o connect token com o id da pessoa", async () => {
    const f = pluggyFalsa({
      "POST /auth": auth,
      "POST /connect_token": () => json({ accessToken: "token-widget" }),
    });
    const c = criarClientePluggy({ config: CONFIG, fetch: f.buscar });
    expect(await c.connectToken("pessoa-1")).toBe("token-widget");
    expect(await c.connectToken("pessoa-1", ITEM)).toBe("token-widget");
    expect(f.pedidos.filter((p) => p.url.endsWith("/auth"))).toHaveLength(1);
    expect(f.pedidos[0]?.corpo).toEqual({ clientId: CONFIG.clientId, clientSecret: CONFIG.clientSecret });
    expect(f.pedidos[1]?.cabecalhos["x-api-key"]).toBe("chave-api-1");
    expect(f.pedidos[1]?.corpo).toEqual({ options: { clientUserId: "pessoa-1", avoidDuplicates: true } });
    expect(f.pedidos[2]?.corpo).toMatchObject({ itemId: ITEM });
  });

  it("renova a apiKey quando ela vence (2 h) e quando a Pluggy devolve 401", async () => {
    let t = 0;
    let chamadasItem = 0;
    const f = pluggyFalsa({
      "POST /auth": auth,
      [`GET /items/${ITEM}`]: () =>
        ++chamadasItem === 2
          ? json({}, 401)
          : json({ id: ITEM, status: "UPDATED", connector: { id: 1, name: "Nubank" } }),
    });
    const c = criarClientePluggy({ config: CONFIG, fetch: f.buscar, agora: () => t });
    await c.item(ITEM);
    t = 3 * 3_600_000;
    await c.item(ITEM);
    expect(f.pedidos.filter((p) => p.url.endsWith("/auth"))).toHaveLength(3);
  });

  it("percorre todas as páginas de investimentos e descarta o que não tem formato", async () => {
    const f = pluggyFalsa({
      "POST /auth": auth,
      "GET /investments": (p) => {
        const pagina = Number(new URL(p.url).searchParams.get("page"));
        return json({
          page: pagina,
          totalPages: 2,
          results:
            pagina === 1
              ? [{ id: "i1", type: "FIXED_INCOME", balance: 10 }, { lixo: true }]
              : [{ id: "i2", type: "FIXED_INCOME", balance: 20 }],
        });
      },
    });
    const r = await criarClientePluggy({ config: CONFIG, fetch: f.buscar }).investimentos(ITEM);
    expect(r.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(f.pedidos[1]?.url).toContain(`itemId=${ITEM}`);
  });

  it("MeuPluggy recusa pedir atualização: devolve false em vez de falhar", async () => {
    const f = pluggyFalsa({
      "POST /auth": auth,
      [`PATCH /items/${ITEM}`]: () => json({ message: "MeuPluggy item can't be updated" }, 400),
    });
    expect(await criarClientePluggy({ config: CONFIG, fetch: f.buscar }).pedirAtualizacao(ITEM)).toBe(false);
    const ok = pluggyFalsa({ "POST /auth": auth, [`PATCH /items/${ITEM}`]: () => json({ id: ITEM }) });
    expect(await criarClientePluggy({ config: CONFIG, fetch: ok.buscar }).pedirAtualizacao(ITEM)).toBe(true);
  });

  it("credenciais erradas, rede fora e resposta estranha viram ErroPluggy explicado", async () => {
    const recusada = pluggyFalsa({ "POST /auth": () => json({ message: "invalid" }, 401) });
    await expect(criarClientePluggy({ config: CONFIG, fetch: recusada.buscar }).item(ITEM)).rejects.toThrow(
      /PLUGGY_CLIENT_ID/,
    );
    const fora = criarClientePluggy({
      config: CONFIG,
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(fora.item(ITEM)).rejects.toThrow(/sem conexão/);
    const estranha = pluggyFalsa({
      "POST /auth": auth,
      [`GET /items/${ITEM}`]: () => new Response("<html>"),
    });
    await expect(
      criarClientePluggy({ config: CONFIG, fetch: estranha.buscar }).item(ITEM),
    ).rejects.toBeInstanceOf(ErroPluggy);
    const semChave = pluggyFalsa({ "POST /auth": () => json({}) });
    await expect(criarClientePluggy({ config: CONFIG, fetch: semChave.buscar }).item(ITEM)).rejects.toThrow(
      /autenticação/,
    );
  });

  it("mensagens por status", () => {
    expect(mensagemPluggy(404, "")).toMatch(/não encontrou/);
    expect(mensagemPluggy(429, "")).toMatch(/esperar/);
    expect(mensagemPluggy(500, '{"message":"boom"}')).toBe("a Pluggy respondeu 500: boom");
  });
});
