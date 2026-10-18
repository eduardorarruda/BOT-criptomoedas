import { readFileSync } from "node:fs";
import { ConfigPublicaEsquema, type ConfigPublica, type ContatoLgpd } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Config } from "../config.js";
import type { Dependencias } from "../dependencias.js";

/** Pública e barata, mas não ilimitada: o mesmo teto de quem lê a página várias vezes. */
export const LIMITE_CONFIG_PUBLICA = { max: 60, timeWindow: "1 minute" } as const;

/** A resposta muda só quando o operador troca o .env e reinicia: cache curto e compartilhável. */
export const CACHE_CONFIG_PUBLICA = "public, max-age=300";

/** Versão do pacote da API (dist/rotas → ../../package.json, igual a src/rotas no teste). */
export function lerVersao(caminho: URL = new URL("../../package.json", import.meta.url)): string {
  try {
    const { version } = JSON.parse(readFileSync(caminho, "utf8")) as { version?: unknown };
    return typeof version === "string" && version.length > 0 ? version : "desconhecida";
  } catch {
    return "desconhecida";
  }
}

const contato = (nome: string | undefined, email: string | undefined): ContatoLgpd | null =>
  nome && email ? { nome, email } : null;

/** O que a política de privacidade precisa mostrar a quem ainda não entrou, e o fuso da instância. */
export function configPublica(config: Config, versao: string): ConfigPublica {
  return {
    controlador: contato(config.ZENTRADE_CONTROLADOR_NOME, config.ZENTRADE_CONTROLADOR_EMAIL),
    encarregado: contato(config.ZENTRADE_ENCARREGADO_NOME, config.ZENTRADE_ENCARREGADO_EMAIL),
    versao,
    fuso: config.ZENTRADE_FUSO,
  };
}

export const rotasPublico: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const corpo = configPublica(deps.config, lerVersao());
  app.get(
    "/publico/config",
    {
      config: { acesso: "publico", rateLimit: LIMITE_CONFIG_PUBLICA },
      schema: { response: { 200: ConfigPublicaEsquema } },
    },
    async (_req, reply) => reply.header("cache-control", CACHE_CONFIG_PUBLICA).send(corpo),
  );
};
