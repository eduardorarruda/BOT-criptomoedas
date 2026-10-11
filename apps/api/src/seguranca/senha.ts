import { hash, verify } from "@node-rs/argon2";

// Argon2id é o algoritmo padrão do @node-rs/argon2; os custos seguem o mínimo da OWASP.
const OPCOES = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashSenha = (senha: string): Promise<string> => hash(senha, OPCOES);

/** Nunca lança: hash corrompido ou senha errada dão `false`. */
export async function verificarSenha(hashGravado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashGravado, senha);
  } catch {
    return false;
  }
}

/**
 * Hash de uma senha que ninguém sabe. Quando o e-mail não existe, o login confere a
 * senha contra ele mesmo assim: a resposta leva o mesmo tempo e não revela quem tem conta.
 */
export const HASH_FALSO = await hashSenha(`zentrade-sem-conta-${Math.random()}`);
