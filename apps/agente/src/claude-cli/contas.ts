import { existsSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { IdContaCli, type ContaCli } from "@zentrade/contratos";

/**
 * Contas do Claude Code: cada uma é uma pasta de login (CLAUDE_CONFIG_DIR). A mesma
 * instalação atende várias contas — o login de cada pessoa, ou "pessoal" e "trabalho".
 * As pastas são definidas por quem opera o servidor (AGENTE_CLAUDE_CONTAS) e nunca
 * vêm da tela: a pessoa só escolhe o id. Assim ninguém aponta o CLI para outra pasta.
 */
export interface ContaClaude {
  readonly id: string;
  readonly nome: string;
  /** null = o login padrão do CLI (~/.claude do usuário do serviço). */
  readonly pasta: string | null;
}

export const CONTA_PADRAO: ContaClaude = { id: "padrao", nome: "Login padrão do Claude Code", pasta: null };

export class ErroContas extends Error {
  override name = "ErroContas";
}

function pastaValida(pasta: string): string {
  if (!isAbsolute(pasta) || pasta.split("/").includes("..") || /["'`$\\\n\r\0]/.test(pasta)) {
    throw new ErroContas(`AGENTE_CLAUDE_CONTAS: a pasta "${pasta}" precisa ser um caminho absoluto simples.`);
  }
  return normalize(pasta).replace(/\/+$/, "");
}

/**
 * Lê "pessoal=/dados/claude/pessoal,trabalho=/dados/claude/trabalho". Vazio = uma conta
 * só, com o login padrão do CLI.
 */
export function lerContas(valor: string | undefined): ContaClaude[] {
  if (!valor || valor.trim() === "") return [CONTA_PADRAO];
  const contas = valor.split(",").map((par) => {
    const [id = "", ...resto] = par.trim().split("=");
    const pasta = resto.join("=").trim();
    if (!IdContaCli.safeParse(id).success || pasta === "") {
      throw new ErroContas(
        `AGENTE_CLAUDE_CONTAS: use id=/pasta separados por vírgula (id com letras minúsculas, números, - e _); veio "${par.trim()}".`,
      );
    }
    return { id, nome: id, pasta: pastaValida(pasta) };
  });
  const ids = new Set(contas.map((c) => c.id));
  if (ids.size !== contas.length) throw new ErroContas("AGENTE_CLAUDE_CONTAS: há ids repetidos.");
  return contas;
}

/** Indício de login: o arquivo de credenciais que o Claude Code grava na pasta da conta. */
export function contaLogada(
  conta: ContaClaude,
  home: string | undefined,
  existe: (caminho: string) => boolean = existsSync,
): boolean {
  const pasta = conta.pasta ?? (home ? join(home, ".claude") : null);
  return pasta !== null && existe(join(pasta, ".credentials.json"));
}

export function descreverContas(
  contas: readonly ContaClaude[],
  home: string | undefined,
  existe: (caminho: string) => boolean = existsSync,
): ContaCli[] {
  return contas.map((c) => ({ id: c.id, nome: c.nome, logada: contaLogada(c, home, existe) }));
}

/** A conta pedida, ou a primeira; id que não existe é erro (a configuração ficou velha). */
export function escolherConta(contas: readonly ContaClaude[], id: string | null | undefined): ContaClaude {
  const [primeira] = contas;
  if (!primeira) throw new ErroContas("Nenhuma conta do Claude Code configurada.");
  if (!id) return primeira;
  const conta = contas.find((c) => c.id === id);
  if (!conta) {
    throw new ErroContas(
      `A conta "${id}" do Claude Code não existe mais neste servidor. Escolha outra em Assistente → Configurações.`,
    );
  }
  return conta;
}
