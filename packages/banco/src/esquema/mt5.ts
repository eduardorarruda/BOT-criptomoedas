import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./acesso.js";
import { instante } from "./tipos.js";

/**
 * Credenciais do MetaTrader 5 (dados do mini índice): servidor, login e senha da conta
 * **demo** de uma corretora, cifrados em envelope com a mesma chave mestra das chaves
 * da Binance (`ZENTRADE_CHAVE_MESTRA`). Uma por pessoa. O conector só lê dados — nunca
 * envia ordem; ver `docs/adr/009-mt5-wine-docker.md`. Espelha `packages/banco/drizzle`
 * (gerado pelo drizzle-kit); o GRANT e o RLS são manuais, como nas demais tabelas.
 */
export const credenciaisMt5 = pgTable("credenciais_mt5", {
  usuarioId: uuid("usuario_id")
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  servidorCifrado: text("servidor_cifrado").notNull(),
  loginCifrado: text("login_cifrado").notNull(),
  senhaCifrada: text("senha_cifrada").notNull(),
  /** Só os últimos dígitos do login, para a pessoa reconhecer a conta. Nunca o segredo. */
  loginFinal: text("login_final").notNull(),
  /** Nome do contínuo nesta corretora (ex.: "WIN$N"); vazio = detectar automaticamente. */
  simboloContinuo: text("simbolo_continuo"),
  criadaEm: instante("criada_em").notNull().defaultNow(),
  validadaEm: instante("validada_em"),
  ultimoErro: text("ultimo_erro"),
});
