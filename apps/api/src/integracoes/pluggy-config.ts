import { z } from "zod";

/**
 * Credenciais da Pluggy: globais da instalação (uma aplicação no painel da Pluggy);
 * as conexões (itens) são de cada pessoa. Sem as duas, a integração fica desligada
 * e a tela explica como ligar. Metade configurada é erro na subida.
 */
const Esquema = z.object({
  PLUGGY_CLIENT_ID: z
    .uuid("PLUGGY_CLIENT_ID precisa ser o Client ID (UUID) da aplicação no painel da Pluggy")
    .optional(),
  PLUGGY_CLIENT_SECRET: z
    .string()
    .min(16, "PLUGGY_CLIENT_SECRET parece curto demais; copie de novo do painel da Pluggy")
    .optional(),
  PLUGGY_URL: z.url().default("https://api.pluggy.ai"),
});

export interface ConfigPluggy {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly url: string;
}

export function lerConfigPluggy(env: Readonly<Record<string, string | undefined>>): ConfigPluggy | null {
  const semVazias = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
  const lido = Esquema.safeParse(semVazias);
  if (!lido.success) {
    throw new Error(`configuração da Pluggy inválida: ${lido.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { PLUGGY_CLIENT_ID: id, PLUGGY_CLIENT_SECRET: segredo, PLUGGY_URL: url } = lido.data;
  if (!id && !segredo) return null;
  if (!id || !segredo) {
    throw new Error(
      "configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET juntos (falta um dos dois); veja .env.example",
    );
  }
  return { clientId: id, clientSecret: segredo, url };
}
