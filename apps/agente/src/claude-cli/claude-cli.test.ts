import { describe, expect, it } from "vitest";
import { ambienteLimpo } from "./ambiente.js";
import { argumentosAnalise, argumentosChat, configuracaoMcp, FERRAMENTAS_NEGADAS } from "./comando.js";
import { CONTA_PADRAO, contaLogada, descreverContas, escolherConta, lerContas } from "./contas.js";
import { explicarFalha, lerJson, lerResultado } from "./resultado.js";

const parametros = {
  configMcp: "/tmp/x/mcp.json",
  instrucoes: "/tmp/x/i.md",
  modelo: null,
  maxTurnos: 8,
  tetoUsd: 0.5,
};
const valorDe = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("linha de comando do claude -p", () => {
  it("análise: JSON com esquema, ferramentas nativas desligadas e só o MCP do ZenTrade liberado", () => {
    const args = argumentosAnalise(parametros, { type: "object" });
    expect(args[0]).toBe("-p");
    expect(args).toContain("--restricted");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--disable-slash-commands");
    expect(valorDe(args, "--tools")).toBe("");
    expect(valorDe(args, "--allowedTools")).toBe("mcp__zentrade");
    expect(valorDe(args, "--permission-mode")).toBe("dontAsk");
    expect(valorDe(args, "--output-format")).toBe("json");
    expect(JSON.parse(valorDe(args, "--json-schema")!)).toEqual({ type: "object" });
    expect(valorDe(args, "--max-turns")).toBe("8");
    expect(valorDe(args, "--max-budget-usd")).toBe("0.5");
    expect(valorDe(args, "--disallowedTools")!.split(",")).toEqual(
      expect.arrayContaining(["Bash", "Edit", "Write", "WebFetch"]),
    );
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(JSON.parse(valorDe(args, "--settings")!)).toMatchObject({ autoMemoryEnabled: false });
  });

  it("chat: stream-json com pedaços parciais e o modelo escolhido", () => {
    const args = argumentosChat({ ...parametros, modelo: "sonnet" });
    expect(valorDe(args, "--output-format")).toBe("stream-json");
    expect(args).toEqual(expect.arrayContaining(["--verbose", "--include-partial-messages"]));
    expect(valorDe(args, "--model")).toBe("sonnet");
    expect(FERRAMENTAS_NEGADAS).toContain("Bash");
  });

  it("configuração do MCP aponta a ponte com o token só no ambiente do servidor", () => {
    const cfg = JSON.parse(
      configuracaoMcp({ comando: "/usr/bin/node", args: ["/app/ponte.js"], env: { A: "1" } }),
    );
    expect(cfg.mcpServers.zentrade).toEqual({
      type: "stdio",
      command: "/usr/bin/node",
      args: ["/app/ponte.js"],
      env: { A: "1" },
    });
  });
});

describe("contas do Claude Code", () => {
  it("vazio = login padrão; lista id=/pasta separada por vírgula", () => {
    expect(lerContas(undefined)).toEqual([CONTA_PADRAO]);
    expect(lerContas(" ")).toEqual([CONTA_PADRAO]);
    expect(lerContas("pessoal=/dados/claude/pessoal/, trabalho=/dados/claude/trabalho")).toEqual([
      { id: "pessoal", nome: "pessoal", pasta: "/dados/claude/pessoal" },
      { id: "trabalho", nome: "trabalho", pasta: "/dados/claude/trabalho" },
    ]);
  });

  it("recusa id estranho, pasta relativa ou com .., e id repetido", () => {
    expect(() => lerContas("Pessoal=/x")).toThrow(/id=/);
    expect(() => lerContas("p=relativa")).toThrow(/absoluto/);
    expect(() => lerContas("p=/dados/../etc")).toThrow(/absoluto/);
    expect(() => lerContas("p=/a$HOME")).toThrow(/absoluto/);
    expect(() => lerContas("p=/a,p=/b")).toThrow(/repetidos/);
    expect(() => lerContas("p")).toThrow(/id=/);
  });

  it("escolhe a pedida, ou a primeira; id que sumiu é erro claro", () => {
    const contas = lerContas("a=/x,b=/y");
    expect(escolherConta(contas, "b").id).toBe("b");
    expect(escolherConta(contas, null).id).toBe("a");
    expect(() => escolherConta(contas, "c")).toThrow(/não existe mais/);
    expect(() => escolherConta([], null)).toThrow(/Nenhuma/);
  });

  it("logada = há arquivo de credenciais na pasta da conta (ou em ~/.claude)", () => {
    const existe = (p: string) => p === "/x/.credentials.json" || p === "/home/z/.claude/.credentials.json";
    expect(contaLogada({ id: "a", nome: "a", pasta: "/x" }, undefined, existe)).toBe(true);
    expect(contaLogada(CONTA_PADRAO, "/home/z", existe)).toBe(true);
    expect(contaLogada(CONTA_PADRAO, undefined, existe)).toBe(false);
    expect(descreverContas(lerContas("a=/x,b=/y"), undefined, existe)).toEqual([
      { id: "a", nome: "a", logada: true },
      { id: "b", nome: "b", logada: false },
    ]);
  });
});

describe("ambiente limpo do CLI", () => {
  it("nunca leva segredos do agente nem a chave da API; leva a pasta da conta", () => {
    const env = ambienteLimpo(
      {
        HOME: "/home/z",
        PATH: "/usr/bin:.",
        LC_ALL: "pt_BR.UTF-8",
        ANTHROPIC_API_KEY: "sk-ant-segredo",
        AGENTE_SEGREDO: "s",
        DATABASE_URL: "postgres://x",
        NODE_OPTIONS: "--require /tmp/mal.js",
        LD_PRELOAD: "/tmp/mal.so",
      },
      { CLAUDE_CONFIG_DIR: "/dados/claude/pessoal" },
      "/opt/claude/bin/claude",
    );
    expect(env).toMatchObject({
      HOME: "/home/z",
      LC_ALL: "pt_BR.UTF-8",
      CLAUDE_CONFIG_DIR: "/dados/claude/pessoal",
    });
    for (const proibida of [
      "ANTHROPIC_API_KEY",
      "AGENTE_SEGREDO",
      "DATABASE_URL",
      "NODE_OPTIONS",
      "LD_PRELOAD",
    ]) {
      expect(env[proibida], proibida).toBeUndefined();
    }
    expect(env["PATH"]!.split(":")).toContain("/opt/claude/bin");
    expect(env["PATH"]!.split(":")).not.toContain(".");
    expect(env["DISABLE_AUTOUPDATER"]).toBe("1");
  });
});

describe("leitura do resultado", () => {
  it("acha o objeto result na saída inteira ou na última linha", () => {
    const r = { type: "result", subtype: "success", structured_output: { a: 1 }, total_cost_usd: 0.01 };
    expect(lerResultado([JSON.stringify(r)])).toMatchObject({ subtype: "success", total_cost_usd: 0.01 });
    expect(lerResultado(['{"type":"system"}', "lixo", JSON.stringify(r)])?.subtype).toBe("success");
    expect(lerResultado(["nada"])).toBeNull();
    expect(lerJson("[1]")).toBeNull();
    expect(lerJson("{quebrado")).toBeNull();
  });

  const fim = (extra: object) => ({
    codigo: 1,
    stderr: "",
    motivo: "normal" as const,
    erroAoIniciar: null,
    ...extra,
  });

  it("explica falha ao iniciar, prazo, login e limite do plano", () => {
    expect(
      explicarFalha(fim({ motivo: "falha_ao_iniciar", erroAoIniciar: "ENOENT" }), 1000, null),
    ).toMatchObject({
      codigo: "nao_encontrado",
    });
    expect(explicarFalha(fim({ motivo: "tempo" }), 55_000, null)?.mensagem).toMatch(/55 s/);
    expect(explicarFalha(fim({ stderr: "Invalid API key · Please run /login" }), 1, null)?.codigo).toBe(
      "autenticacao",
    );
    expect(explicarFalha(fim({ stderr: "Claude AI usage limit reached" }), 1, null)?.codigo).toBe("limite");
    expect(explicarFalha(fim({ stderr: "\u001b[31mboom\u001b[0m\n" }), 1, null)?.mensagem).toMatch(/: boom$/);
    expect(explicarFalha(fim({ motivo: "cancelado" }), 1, null)).toBeNull();
    expect(explicarFalha(fim({ codigo: 0 }), 1, { type: "result", subtype: "success" })).toBeNull();
  });
});
