/**
 * Erros que a API traduz em resposta para a pessoa. `codigo` vira o `erro.codigo`
 * do contrato; a mensagem diz o que deu errado e como resolver.
 */
export type CodigoErroDados = "nao_encontrado" | "conflito" | "invalido" | "estado_invalido" | "expirada";

export class ErroDados extends Error {
  override name = "ErroDados";
  constructor(
    readonly codigo: CodigoErroDados,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

interface ErroPostgres {
  readonly code?: unknown;
  readonly constraint_name?: unknown;
}

/** Código SQLSTATE de um erro do postgres.js (o Drizzle embrulha o original em `cause`). */
export function codigoPostgres(erro: unknown): string | undefined {
  for (
    let atual: unknown = erro;
    atual && typeof atual === "object";
    atual = (atual as { cause?: unknown }).cause
  ) {
    const codigo = (atual as ErroPostgres).code;
    if (typeof codigo === "string" && /^[0-9A-Z]{5}$/.test(codigo)) return codigo;
  }
  return undefined;
}

export const VIOLACAO_UNICA = "23505";
export const VIOLACAO_CHAVE_ESTRANGEIRA = "23503";

/** A linha que um INSERT ... RETURNING tem de devolver. Se não vier, é erro, não `undefined` silencioso. */
export function umaLinha<T>(linhas: readonly T[]): T {
  const [linha] = linhas;
  if (linha === undefined) throw new Error("o banco não devolveu a linha gravada");
  return linha;
}
