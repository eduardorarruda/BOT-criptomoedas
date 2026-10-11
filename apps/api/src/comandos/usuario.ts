import type { Banco, Usuario } from "@zentrade/banco";
import { z } from "zod";
import { hashSenha } from "../seguranca/senha.js";

export const NovoUsuarioEsquema = z.object({
  email: z.email("informe um e-mail válido em --email"),
  nome: z.string().min(1, "informe o nome em --nome").max(80),
  senha: z
    .string()
    .min(12, "a senha precisa de pelo menos 12 caracteres (uma frase longa é melhor que símbolos)")
    .max(200),
});

/** Cria uma pessoa. Não existe cadastro público: só por este comando, no servidor. */
export async function criarUsuario(
  banco: Banco,
  dados: z.input<typeof NovoUsuarioEsquema>,
): Promise<Usuario> {
  const lido = NovoUsuarioEsquema.safeParse(dados);
  if (!lido.success) throw new Error(lido.error.issues.map((i) => i.message).join("; "));
  const usuario = await banco.usuarios.criar({
    email: lido.data.email,
    nome: lido.data.nome,
    senhaHash: await hashSenha(lido.data.senha),
  });
  await banco.auditoria.registrar({
    usuarioId: usuario.id,
    acao: "usuario_criado",
    detalhes: { via: "comando" },
  });
  return usuario;
}

/** Lê `--chave valor` dos argumentos da linha de comando. */
export function lerArgumentos(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i];
    const proximo = argv[i + 1];
    if (atual?.startsWith("--") && proximo !== undefined && !proximo.startsWith("--")) {
      args[atual.slice(2)] = proximo;
      i++;
    }
  }
  return args;
}
