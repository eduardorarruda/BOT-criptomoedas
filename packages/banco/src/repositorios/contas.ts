import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { cifrar, decifrar } from "../cifra.js";
import { comoUsuario, type Db } from "../cliente.js";
import { ms } from "../conversao.js";
import { codigoPostgres, ErroDados, umaLinha, VIOLACAO_UNICA } from "../erros.js";
import { contasCorretora } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

export type RedeConta = "testnet" | "real";

export interface ContaCorretora {
  readonly id: string;
  readonly corretora: "binance";
  readonly rede: RedeConta;
  /** Só o final da chave, para a pessoa reconhecer qual é. O segredo nunca sai. */
  readonly apiKeyFinal: string;
  readonly criadaEm: number;
}

export interface NovaConta {
  readonly corretora: "binance";
  readonly rede: RedeConta;
  readonly apiKey: string;
  readonly apiSecret: string;
}

const colunas = {
  id: contasCorretora.id,
  corretora: contasCorretora.corretora,
  rede: contasCorretora.rede,
  apiKeyFinal: contasCorretora.apiKeyFinal,
  criadaEm: contasCorretora.criadaEm,
};

const contexto = (id: string, campo: "api_key" | "api_secret"): string => `contas_corretora:${id}:${campo}`;
const paraConta = (c: Omit<ContaCorretora, "criadaEm"> & { criadaEm: Date }): ContaCorretora => ({
  ...c,
  criadaEm: ms(c.criadaEm),
});

export function repositorioContas(db: Db, chaveMestra: Buffer) {
  async function inserir(usuarioId: string, conta: NovaConta): Promise<ContaCorretora> {
    const id = randomUUID();
    return comoUsuario(db, usuarioId, async (tx) => {
      const linhas = await tx
        .insert(contasCorretora)
        .values({
          id,
          usuarioId,
          corretora: conta.corretora,
          rede: conta.rede,
          apiKeyCifrada: cifrar(conta.apiKey, chaveMestra, contexto(id, "api_key")),
          apiSecretCifrado: cifrar(conta.apiSecret, chaveMestra, contexto(id, "api_secret")),
          apiKeyFinal: `…${conta.apiKey.slice(-4)}`,
        })
        .returning(colunas);
      await auditar(tx, usuarioId, "conta_corretora_cadastrada", id, {
        corretora: conta.corretora,
        rede: conta.rede,
      });
      return paraConta(umaLinha(linhas));
    });
  }

  return {
    listar: (usuarioId: string): Promise<ContaCorretora[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (await tx.select(colunas).from(contasCorretora).orderBy(asc(contasCorretora.criadaEm))).map(
          paraConta,
        ),
      ),

    async criar(usuarioId: string, conta: NovaConta): Promise<ContaCorretora> {
      try {
        return await inserir(usuarioId, conta);
      } catch (erro) {
        if (codigoPostgres(erro) === VIOLACAO_UNICA) {
          throw new ErroDados(
            "conflito",
            `já existe uma conta ${conta.corretora} na rede ${conta.rede}; remova a antiga antes de cadastrar outra`,
          );
        }
        throw erro;
      }
    },

    remover: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const removidas = await tx
          .delete(contasCorretora)
          .where(eq(contasCorretora.id, id))
          .returning({ id: contasCorretora.id });
        if (removidas.length > 0) await auditar(tx, usuarioId, "conta_corretora_removida", id);
        return removidas.length > 0;
      }),

    /** Para o motor: a chave decifrada da conta da pessoa naquela rede. Nunca exponha isto na API. */
    async credenciais(
      usuarioId: string,
      rede: RedeConta,
    ): Promise<{ apiKey: string; apiSecret: string } | null> {
      const [c] = await db
        .select({
          id: contasCorretora.id,
          k: contasCorretora.apiKeyCifrada,
          s: contasCorretora.apiSecretCifrado,
        })
        .from(contasCorretora)
        .where(and(eq(contasCorretora.usuarioId, usuarioId), eq(contasCorretora.rede, rede)));
      if (!c) return null;
      return {
        apiKey: decifrar(c.k, chaveMestra, contexto(c.id, "api_key")),
        apiSecret: decifrar(c.s, chaveMestra, contexto(c.id, "api_secret")),
      };
    },
  };
}

export type RepositorioContas = ReturnType<typeof repositorioContas>;
