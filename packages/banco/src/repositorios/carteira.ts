import type { EstadoSincronizacao, OrigemNegociacao, RedeConta } from "@zentrade/contratos";
import { dec, paraTexto, type Lado, type Valor } from "@zentrade/dominio";
import { and, asc, eq, max, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import {
  carteiraNegociacoes,
  carteiraSaldos,
  carteiraSincronizacoes,
  contasCorretora,
} from "../esquema/index.js";

/** Negociação da carteira como entra e sai do banco (decimais exatos). */
export interface NegociacaoCarteiraGravada {
  readonly simbolo: string;
  readonly base: string;
  readonly cotacao: string;
  readonly idNegociacao: number;
  readonly idOrdem: number;
  readonly idCliente: string | null;
  readonly origem: OrigemNegociacao;
  readonly lado: Lado;
  readonly preco: Valor;
  readonly quantidade: Valor;
  readonly valorCotacao: Valor;
  readonly taxa: Valor;
  readonly ativoTaxa: string;
  readonly cotacaoUsdt: Valor | null;
  readonly taxaUsdt: Valor | null;
  readonly em: number;
}

/** Como sai: com o id estável "SIMBOLO:id" e o id da ordem em texto (o formato do cálculo). */
export interface NegociacaoCarteiraLida extends Omit<NegociacaoCarteiraGravada, "idOrdem"> {
  readonly id: string;
  readonly idOrdem: string;
}

export interface SaldoCarteira {
  readonly ativo: string;
  readonly livre: Valor;
  readonly bloqueado: Valor;
}

export interface EstadoSincronizacaoGravado extends EstadoSincronizacao {
  readonly simbolos: string[];
}

export interface NovaSincronizacao extends EstadoSincronizacao {
  readonly simbolos: readonly string[];
}

const LOTE = 500;
const texto = (v: Valor): string => paraTexto(v);
const opcional = (v: string | null): Valor | null => (v === null ? null : dec(v));

function linhaDe(usuarioId: string, rede: RedeConta, n: NegociacaoCarteiraGravada) {
  return {
    usuarioId,
    rede,
    simbolo: n.simbolo,
    base: n.base,
    cotacao: n.cotacao,
    idNegociacao: n.idNegociacao,
    idOrdem: n.idOrdem,
    idCliente: n.idCliente,
    origem: n.origem,
    lado: n.lado,
    preco: texto(n.preco),
    quantidade: texto(n.quantidade),
    valorCotacao: texto(n.valorCotacao),
    taxa: texto(n.taxa),
    ativoTaxa: n.ativoTaxa,
    cotacaoUsdt: n.cotacaoUsdt === null ? null : texto(n.cotacaoUsdt),
    taxaUsdt: n.taxaUsdt === null ? null : texto(n.taxaUsdt),
    em: new Date(n.em),
  };
}

function negociacaoDe(l: typeof carteiraNegociacoes.$inferSelect): NegociacaoCarteiraLida {
  return {
    id: `${l.simbolo}:${l.idNegociacao}`,
    simbolo: l.simbolo,
    base: l.base,
    cotacao: l.cotacao,
    idNegociacao: l.idNegociacao,
    idOrdem: String(l.idOrdem),
    idCliente: l.idCliente,
    origem: l.origem,
    lado: l.lado,
    preco: dec(l.preco),
    quantidade: dec(l.quantidade),
    valorCotacao: dec(l.valorCotacao),
    taxa: dec(l.taxa),
    ativoTaxa: l.ativoTaxa,
    cotacaoUsdt: opcional(l.cotacaoUsdt),
    taxaUsdt: opcional(l.taxaUsdt),
    em: ms(l.em),
  };
}

const daRede = (t: { usuarioId: PgColumn; rede: PgColumn }, usuarioId: string, rede: RedeConta) =>
  and(eq(t.usuarioId, usuarioId), eq(t.rede, rede));

async function inserirLote(tx: Tx, linhas: ReturnType<typeof linhaDe>[]): Promise<number> {
  const inseridas = await tx
    .insert(carteiraNegociacoes)
    .values(linhas)
    .onConflictDoNothing({
      target: [
        carteiraNegociacoes.usuarioId,
        carteiraNegociacoes.rede,
        carteiraNegociacoes.simbolo,
        carteiraNegociacoes.idNegociacao,
      ],
    })
    .returning({ id: carteiraNegociacoes.id });
  return inseridas.length;
}

/**
 * A carteira da Binance no banco. Tudo o que recebe `usuarioId` roda sob RLS
 * (comoUsuario). `contasParaSincronizar` é acesso de sistema, para a sincronização periódica.
 */
export function repositorioCarteira(db: Db) {
  return {
    /** Grava as negociações; as que já existem são ignoradas. Devolve quantas entraram. */
    gravarNegociacoes: (usuarioId: string, rede: RedeConta, ns: readonly NegociacaoCarteiraGravada[]) =>
      comoUsuario(db, usuarioId, async (tx) => {
        let novas = 0;
        for (let i = 0; i < ns.length; i += LOTE)
          novas += await inserirLote(
            tx,
            ns.slice(i, i + LOTE).map((n) => linhaDe(usuarioId, rede, n)),
          );
        return novas;
      }),

    /** Troca a foto dos saldos inteira: moeda que sumiu da conta some daqui. */
    gravarSaldos: (usuarioId: string, rede: RedeConta, saldos: readonly SaldoCarteira[], em: number) =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx.delete(carteiraSaldos).where(daRede(carteiraSaldos, usuarioId, rede));
        if (saldos.length === 0) return;
        await tx.insert(carteiraSaldos).values(
          saldos.map((s) => ({
            usuarioId,
            rede,
            ativo: s.ativo,
            livre: texto(s.livre),
            bloqueado: texto(s.bloqueado),
            atualizadoEm: new Date(em),
          })),
        );
      }),

    /** Grava o desfecho da sincronização; os pares se somam aos já conhecidos. */
    registrarSincronizacao: (usuarioId: string, rede: RedeConta, s: NovaSincronizacao) =>
      comoUsuario(db, usuarioId, async (tx) => {
        const valores = {
          em: new Date(s.em),
          ok: s.ok,
          erro: s.erro,
          negociacoes: s.negociacoes,
          simbolos: [...new Set(s.simbolos)].sort(),
        };
        await tx
          .insert(carteiraSincronizacoes)
          .values({ usuarioId, rede, ...valores })
          .onConflictDoUpdate({
            target: [carteiraSincronizacoes.usuarioId, carteiraSincronizacoes.rede],
            set: {
              ...valores,
              simbolos: sql`(select coalesce(array_agg(distinct s order by s), '{}') from unnest(${carteiraSincronizacoes.simbolos} || excluded.simbolos) s)`,
            },
          });
      }),

    /** Redes em que a pessoa tem conta cadastrada (só a rede: nada da chave). */
    redes: (usuarioId: string): Promise<RedeConta[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx
            .selectDistinct({ rede: contasCorretora.rede })
            .from(contasCorretora)
            .orderBy(asc(contasCorretora.rede))
        ).map((l) => l.rede),
      ),

    sincronizacao: (usuarioId: string, rede: RedeConta): Promise<EstadoSincronizacaoGravado | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [s] = await tx
          .select()
          .from(carteiraSincronizacoes)
          .where(daRede(carteiraSincronizacoes, usuarioId, rede));
        return s
          ? { em: ms(s.em), ok: s.ok, erro: s.erro, negociacoes: s.negociacoes, simbolos: s.simbolos }
          : null;
      }),

    /** Maior id de negociação já importado por par: a próxima importação começa depois dele. */
    ultimosIds: (usuarioId: string, rede: RedeConta): Promise<Map<string, number>> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select({ simbolo: carteiraNegociacoes.simbolo, ultimo: max(carteiraNegociacoes.idNegociacao) })
          .from(carteiraNegociacoes)
          .where(daRede(carteiraNegociacoes, usuarioId, rede))
          .groupBy(carteiraNegociacoes.simbolo);
        return new Map(linhas.map((l) => [l.simbolo, Number(l.ultimo)]));
      }),

    saldos: (usuarioId: string, rede: RedeConta): Promise<SaldoCarteira[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx
            .select()
            .from(carteiraSaldos)
            .where(daRede(carteiraSaldos, usuarioId, rede))
            .orderBy(asc(carteiraSaldos.ativo))
        ).map((s) => ({ ativo: s.ativo, livre: dec(s.livre), bloqueado: dec(s.bloqueado) })),
      ),

    /** Negociações em ordem do tempo; com `ativo`, só as que tocam a moeda (base, cotação ou taxa). */
    negociacoes: (usuarioId: string, rede: RedeConta, ativo?: string): Promise<NegociacaoCarteiraLida[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const n = carteiraNegociacoes;
        const daMoeda = ativo
          ? or(eq(n.base, ativo), eq(n.cotacao, ativo), eq(n.ativoTaxa, ativo))
          : undefined;
        const linhas = await tx
          .select()
          .from(n)
          .where(and(daRede(n, usuarioId, rede), daMoeda))
          .orderBy(asc(n.em), asc(n.simbolo), asc(n.idNegociacao));
        return linhas.map(negociacaoDe);
      }),

    /** Sistema (sem RLS): toda pessoa e rede com conta cadastrada, para a sincronização periódica. */
    async contasParaSincronizar(): Promise<{ usuarioId: string; rede: RedeConta }[]> {
      return db
        .select({ usuarioId: contasCorretora.usuarioId, rede: contasCorretora.rede })
        .from(contasCorretora)
        .orderBy(asc(contasCorretora.criadaEm));
    },
  };
}

export type RepositorioCarteira = ReturnType<typeof repositorioCarteira>;
