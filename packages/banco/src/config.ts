import { z } from "zod";
import { lerChaveMestra } from "./cifra.js";

/** Variáveis de ambiente do banco, validadas no início: falta de configuração derruba cedo, com explicação. */
export const ConfigBancoEsquema = z.object({
  DATABASE_URL: z
    .string({ error: "defina DATABASE_URL (ex.: postgres://usuario:senha@127.0.0.1:55432/zentrade)" })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL precisa começar com postgres://"),
  ZENTRADE_CHAVE_MESTRA: z
    .string({ error: "defina ZENTRADE_CHAVE_MESTRA (32 bytes em base64; gere com: openssl rand -base64 32)" })
    .transform((v, ctx) => {
      try {
        return lerChaveMestra(v);
      } catch (erro) {
        ctx.addIssue({ code: "custom", message: (erro as Error).message });
        return z.NEVER;
      }
    }),
});

export type ConfigBanco = z.infer<typeof ConfigBancoEsquema>;

export function lerConfigBanco(env: NodeJS.ProcessEnv): ConfigBanco {
  const lido = ConfigBancoEsquema.safeParse(env);
  if (!lido.success) {
    throw new Error(`configuração do banco inválida: ${lido.error.issues.map((i) => i.message).join("; ")}`);
  }
  return lido.data;
}
