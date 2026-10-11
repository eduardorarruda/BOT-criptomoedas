import type { Escopo, Usuario } from "@zentrade/banco";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoAutenticado, proibido, reautenticacaoNecessaria } from "../erros.js";
import { iguais, sha256 } from "../seguranca/tokens.js";

/**
 * Quem pode chamar cada rota, declarado em `config.acesso`:
 * - publico: ninguém precisa estar autenticado;
 * - leitura / operar: sessão, ou token Bearer com o escopo;
 * - sessao: só sessão da tela (tokens não servem).
 * `config.critica` exige reautenticação nos últimos 5 minutos (e, por isso, sessão).
 * Rota sem `acesso` cai no mais restrito: sessão.
 */
export type Acesso = "publico" | "leitura" | "operar" | "sessao";

export type Autenticacao =
  | {
      readonly via: "sessao";
      readonly usuario: Usuario;
      readonly sessaoId: string;
      readonly csrf: string;
      readonly reautenticadaEm: number;
    }
  | { readonly via: "token"; readonly usuarioId: string; readonly tokenId: string; readonly escopo: Escopo };

declare module "fastify" {
  interface FastifyRequest {
    autenticacao: Autenticacao | null;
  }
  interface FastifyContextConfig {
    acesso?: Acesso;
    critica?: boolean;
  }
}

export const COOKIE_SESSAO = "zt_sessao";
export const COOKIE_CSRF = "zt_csrf";
export const CABECALHO_CSRF = "x-csrf-token";
export const REAUTENTICACAO_MS = 5 * 60_000;
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

async function identificar(req: FastifyRequest, deps: Dependencias): Promise<Autenticacao | null> {
  const cabecalho = req.headers.authorization;
  if (cabecalho !== undefined) {
    const bearer = /^Bearer ([\w-]{20,200})$/.exec(cabecalho);
    const token = bearer?.[1] ? await deps.banco.tokens.porHash(sha256(bearer[1])) : null;
    if (!token) {
      throw new ErroApi(401, "token_invalido", "token inválido ou revogado; crie outro na tela, em Tokens");
    }
    return { via: "token", usuarioId: token.usuarioId, tokenId: token.id, escopo: token.escopo };
  }
  const cookie = req.cookies[COOKIE_SESSAO];
  if (!cookie) return null;
  const sessaoId = sha256(cookie);
  const s = await deps.banco.sessoes.obter(sessaoId, deps.agora());
  return s
    ? { via: "sessao", usuario: s.usuario, sessaoId, csrf: s.csrf, reautenticadaEm: s.reautenticadaEm }
    : null;
}

/** Para checagens que dependem do corpo (ex.: desligar a parada total, ligar dinheiro real). */
export function exigirReautenticacao(req: FastifyRequest, agora: number): void {
  const a = req.autenticacao;
  if (a?.via !== "sessao" || agora - a.reautenticadaEm > REAUTENTICACAO_MS) throw reautenticacaoNecessaria();
}

function autorizarToken(acesso: Acesso, critica: boolean, escopo: Escopo): void {
  if (acesso === "sessao" || critica) {
    throw proibido(
      "exige_sessao",
      "esta ação só pode ser feita pela tela, com sessão; tokens não servem aqui",
    );
  }
  if (acesso === "operar" && escopo !== "operar") {
    throw proibido(
      "escopo_insuficiente",
      "este token só tem escopo de leitura; crie um token com escopo operar",
    );
  }
}

function autorizar(req: FastifyRequest, agora: number): void {
  const { acesso = "sessao", critica = false } = req.routeOptions.config;
  if (acesso === "publico") return;
  const a = req.autenticacao;
  if (!a) throw naoAutenticado();
  if (a.via === "token") return autorizarToken(acesso, critica, a.escopo);
  if (!METODOS_SEGUROS.has(req.method)) {
    const enviado = req.headers[CABECALHO_CSRF];
    if (typeof enviado !== "string" || !iguais(enviado, a.csrf)) {
      throw proibido(
        "csrf_invalido",
        `envie o cabeçalho ${CABECALHO_CSRF} com o valor do cookie ${COOKIE_CSRF}`,
      );
    }
  }
  if (critica) exigirReautenticacao(req, agora);
}

export function registrarAutenticacao(app: FastifyInstance, deps: Dependencias): void {
  app.decorateRequest("autenticacao", null);
  app.addHook("onRequest", async (req) => {
    req.autenticacao = await identificar(req, deps);
  });
  app.addHook("preHandler", async (req) => autorizar(req, deps.agora()));
}

/** Id da pessoa autenticada (as rotas só chegam aqui depois de `autorizar`). */
export function usuarioIdDe(req: FastifyRequest): string {
  const a = req.autenticacao;
  if (!a) throw naoAutenticado();
  return a.via === "sessao" ? a.usuario.id : a.usuarioId;
}

/** Quem fez, para a auditoria: e-mail na sessão, id do token no Bearer. */
export function autorDe(req: FastifyRequest): string {
  const a = req.autenticacao;
  if (!a) throw naoAutenticado();
  return a.via === "sessao" ? a.usuario.email : `token:${a.tokenId}`;
}
