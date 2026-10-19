import { z } from "zod";
import { Instante } from "./comum.js";

/**
 * MetaTrader 5 (dados do mini índice): servidor, login e senha da conta DEMO de uma
 * corretora. Só leitura de dados — o conector nunca envia ordem. Os segredos entram
 * (PUT) e nunca voltam: a API devolve só o estado.
 */
const NOME_SIMBOLO = /^[A-Za-z0-9$@._-]{1,20}$/;

export const NovasCredenciaisMt5Esquema = z.object({
  servidor: z.string().trim().min(3, "informe o servidor da corretora").max(200),
  login: z.string().trim().regex(/^\d{3,20}$/, "o login do MT5 é um número"),
  senha: z.string().min(1, "informe a senha da conta demo").max(200),
  /** Nome do contínuo nesta corretora (WIN$N, WIN$, WIN@…); vazio = detectar. */
  simboloContinuo: z.string().trim().regex(NOME_SIMBOLO, "nome de símbolo inválido").optional(),
  /** Fuso do relógio do servidor: nome IANA (Europe/Athens) ou +03:00; vazio = detectar. */
  fusoServidor: z.string().trim().min(1).max(40).optional(),
});
export type NovasCredenciaisMt5 = z.infer<typeof NovasCredenciaisMt5Esquema>;

export const EstadoMt5Esquema = z.object({
  configurado: z.boolean(),
  loginFinal: z.string().nullable(),
  simboloContinuo: z.string().nullable(),
  fusoServidor: z.string().nullable(),
  criadaEm: Instante.nullable(),
  validadaEm: Instante.nullable(),
  ultimoErro: z.string().nullable(),
});
export type EstadoMt5 = z.infer<typeof EstadoMt5Esquema>;

export const ESTADO_MT5_VAZIO: EstadoMt5 = {
  configurado: false,
  loginFinal: null,
  simboloContinuo: null,
  fusoServidor: null,
  criadaEm: null,
  validadaEm: null,
  ultimoErro: null,
};

export const TesteMt5Esquema = z.object({
  ok: z.boolean(),
  /** Os símbolos WIN* que a corretora tem (ajuda a escolher o contínuo). */
  simbolos: z.array(z.string()),
  erro: z.string().nullable(),
});
export type TesteMt5 = z.infer<typeof TesteMt5Esquema>;

/** Troca a senha por [oculto] em qualquer texto que vá para log, erro ou tela. */
export function ocultarSenhaMt5(texto: string, senha: string): string {
  return senha.length === 0 ? texto : texto.split(senha).join("[oculto]");
}
