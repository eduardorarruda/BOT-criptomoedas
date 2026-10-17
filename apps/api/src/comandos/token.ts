import { parseArgs } from "node:util";
import { z } from "zod";
import { gerarToken, sha256 } from "../seguranca/tokens.js";

const Argumentos = z.object({
  email: z.email("informe o e-mail da pessoa em --email"),
  nome: z.string().trim().min(1).max(60).default("terminal"),
  escopo: z.enum(["leitura", "operar"], { error: "--escopo aceita leitura ou operar" }).default("leitura"),
});

type Escopo = "leitura" | "operar";

/** Só o que o comando usa do banco (o Banco inteiro serve). */
export interface DependenciasToken {
  readonly usuarios: { porEmail(email: string): Promise<{ readonly id: string } | null> };
  readonly tokens: {
    criar(usuarioId: string, t: { nome: string; escopo: Escopo; hash: string }): Promise<unknown>;
  };
}

/**
 * Token de API criado por quem opera a instância, para a conta de uma pessoa (ex.: a
 * linha de comando de quem administra o servidor). Mesmo formato e mesmo hash da rota
 * `POST /tokens`; só o hash vai para o banco, e a criação entra na auditoria da pessoa.
 */
export async function criarTokenPorEmail(
  argv: readonly string[],
  banco: DependenciasToken,
): Promise<{ token: string; nome: string; escopo: Escopo }> {
  const { values } = parseArgs({
    args: [...argv],
    options: { email: { type: "string" }, nome: { type: "string" }, escopo: { type: "string" } },
    strict: true,
  });
  const lido = Argumentos.safeParse(values);
  if (!lido.success) throw new Error(lido.error.issues.map((i) => i.message).join("; "));
  const { email, nome, escopo } = lido.data;
  const pessoa = await banco.usuarios.porEmail(email);
  if (!pessoa) throw new Error(`nenhuma pessoa com o e-mail ${email}`);
  const token = gerarToken("zt_");
  await banco.tokens.criar(pessoa.id, { nome, escopo, hash: sha256(token) });
  return { token, nome, escopo };
}
