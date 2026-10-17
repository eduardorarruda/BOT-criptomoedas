import { ConfigBancoEsquema, criarBancoDoMotor, type BancoDoMotor } from "@zentrade/banco";

/** Banco dos comandos de importação: só DATABASE_URL, com poucas conexões. */
export function abrirBancoDosComandos(env: NodeJS.ProcessEnv): BancoDoMotor {
  const url = ConfigBancoEsquema.shape.DATABASE_URL.safeParse(env["DATABASE_URL"]);
  if (!url.success) throw new Error(url.error.issues[0]?.message ?? "defina DATABASE_URL");
  return criarBancoDoMotor({ url: url.data, maximoConexoes: 2 });
}
