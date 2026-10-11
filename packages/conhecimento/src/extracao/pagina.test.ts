import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerLink } from "./link.js";
import { baixarPagina, validarUrl } from "./pagina.js";
import { enderecoPublico, lookupSeguro } from "./rede.js";

let servidor: Server;
let base: string;
const soLocal = (ip: string) => ip === "127.0.0.1";

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const rotas: Record<string, () => void> = {
      "/artigo": () => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(
          `<html><head><title>Notícia</title></head><body><p>${"BTC caiu. ".repeat(40)}</p></body></html>`,
        );
      },
      "/texto": () => {
        res.setHeader("content-type", "text/plain");
        res.end("só texto");
      },
      "/volta": () => {
        res.statusCode = 302;
        res.setHeader("location", "/texto");
        res.end();
      },
      "/metadata": () => {
        res.statusCode = 302;
        res.setHeader("location", "http://169.254.169.254/latest/meta-data/");
        res.end();
      },
      "/loop": () => {
        res.statusCode = 301;
        res.setHeader("location", "/loop");
        res.end();
      },
      "/imagem": () => {
        res.setHeader("content-type", "image/png");
        res.end("png");
      },
      "/grande": () => {
        res.setHeader("content-type", "text/plain");
        res.end("x".repeat(5000));
      },
      "/lento": () => setTimeout(() => res.end("tarde"), 500),
    };
    const rota = rotas[req.url ?? ""];
    if (rota) return rota();
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

describe("enderecoPublico (defesa contra SSRF)", () => {
  it("recusa loopback, redes privadas, link-local, CGNAT, multicast e IPv6 local", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "nao-e-ip",
    ]) {
      expect(enderecoPublico(ip), ip).toBe(false);
    }
  });

  it("aceita endereço público", () => {
    expect(enderecoPublico("8.8.8.8")).toBe(true);
    expect(enderecoPublico("2606:4700:4700::1111")).toBe(true);
    expect(enderecoPublico("::ffff:8.8.8.8")).toBe(true);
  });
});

describe("validarUrl", () => {
  it("só http/https, sem credencial e sem IP interno escrito direto", () => {
    expect(() => validarUrl("file:///etc/passwd")).toThrow(/http/);
    expect(() => validarUrl("gopher://x.com")).toThrow(/http/);
    expect(() => validarUrl("não é url")).toThrow(/inválido/);
    expect(() => validarUrl("https://user:senha@exemplo.com")).toThrow(/usuário e senha/);
    expect(() => validarUrl("http://127.0.0.1:8080/")).toThrow(/rede interna/);
    expect(() => validarUrl("http://[::1]/")).toThrow(/rede interna/);
    expect(() => validarUrl("http://169.254.169.254/")).toThrow(/rede interna/);
    expect(validarUrl("https://exemplo.com/a").hostname).toBe("exemplo.com");
  });
});

describe("lookupSeguro", () => {
  const resolver = (enderecos: { address: string; family: number }[]) =>
    ((_h: string, _o: unknown, cb: (e: Error | null, a: typeof enderecos) => void) =>
      cb(null, enderecos)) as never;

  it("barra o nome que resolve para qualquer endereço interno (inclusive misturado com público)", async () => {
    const lookup = lookupSeguro(
      enderecoPublico,
      resolver([
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ]),
    );
    const erro = await new Promise((ok) => lookup("x.com", {}, (e) => ok(e)));
    expect(String(erro)).toMatch(/rede interna/);
  });

  it("devolve o primeiro endereço ou a lista, conforme pedido", async () => {
    const lookup = lookupSeguro(enderecoPublico, resolver([{ address: "8.8.8.8", family: 4 }]));
    const um = await new Promise((ok) => lookup("x.com", {}, (_e, a, f) => ok([a, f])));
    expect(um).toEqual(["8.8.8.8", 4]);
    const todos = await new Promise((ok) => lookup("x.com", { all: true }, (_e, a) => ok(a)));
    expect(todos).toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("repassa o erro de DNS", async () => {
    const falho = ((_h: string, _o: unknown, cb: (e: Error) => void) => cb(new Error("ENOTFOUND"))) as never;
    const erro = await new Promise((ok) => lookupSeguro(enderecoPublico, falho)("x", {}, (e) => ok(e)));
    expect(String(erro)).toMatch(/ENOTFOUND/);
  });
});

describe("baixarPagina", () => {
  it("por padrão recusa a própria máquina, por IP ou por nome (localhost)", async () => {
    await expect(baixarPagina(`${base}/texto`)).rejects.toThrow(/rede interna/);
    const porNome = base.replace("127.0.0.1", "localhost");
    await expect(baixarPagina(`${porNome}/texto`)).rejects.toThrow(/rede interna/);
  });

  it("baixa HTML e texto, seguindo redirecionamento", async () => {
    const r = await baixarPagina(`${base}/volta`, { permitirEndereco: soLocal });
    expect(r).toMatchObject({ url: `${base}/texto`, tipo: "txt" });
    expect(r.bytes.toString()).toBe("só texto");
  });

  it("redirecionamento para o metadata da nuvem é barrado", async () => {
    await expect(baixarPagina(`${base}/metadata`, { permitirEndereco: soLocal })).rejects.toThrow(
      /rede interna/,
    );
  });

  it("recusa laço de redirecionamento, tipo não aceito, erro HTTP, tamanho e prazo", async () => {
    const o = { permitirEndereco: soLocal };
    await expect(baixarPagina(`${base}/loop`, o)).rejects.toThrow(/vezes demais/);
    await expect(baixarPagina(`${base}/imagem`, o)).rejects.toThrow(/image\/png/);
    await expect(baixarPagina(`${base}/nada`, o)).rejects.toThrow(/404/);
    await expect(baixarPagina(`${base}/grande`, { ...o, limiteBytes: 1000 })).rejects.toThrow(/passa de/);
    await expect(baixarPagina(`${base}/lento`, { ...o, tempoMs: 100 })).rejects.toThrow(/demorou/);
  });

  it("domínio que não existe vira mensagem clara", async () => {
    await expect(baixarPagina("http://nao-existe.invalid/", { tempoMs: 5000 })).rejects.toThrow(
      /Não achei esse endereço|Não consegui/,
    );
  });
});

describe("lerLink", () => {
  it("baixa e extrai o texto com o título da página", async () => {
    const r = await lerLink(`${base}/artigo`, { permitirEndereco: soLocal });
    expect(r).toMatchObject({ tipo: "html", titulo: "Notícia", truncado: false });
    expect(r.texto).toContain("BTC caiu.");
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("usa o extrator que receber (a API passa o isolado em worker)", async () => {
    const vistos: string[] = [];
    const r = await lerLink(`${base}/artigo`, { permitirEndereco: soLocal }, async (bytes, tipo) => {
      vistos.push(tipo);
      const texto = `extraído ${bytes.length}`;
      return { texto, titulo: null, caracteres: texto.length, truncado: false };
    });
    expect(vistos).toEqual(["html"]);
    expect(r.texto).toMatch(/^extraído \d+$/);
  });
});
