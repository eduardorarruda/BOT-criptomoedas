import type { Rede } from "@zentrade/contratos";
import { dec, posicaoDe, type Execucao, type ResultadoRealizado, type Valor } from "@zentrade/dominio";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { deltasRealizados, inicioDoDiaUtc } from "../calculos.js";
import type { Executor } from "../cliente.js";
import { candles, robos } from "../esquema/index.js";
import { execucoesPorRobo } from "./execucoes.js";

/** Preço mais velho que isto não vale para o não realizado: fica o preço médio (sem resultado aberto). */
const IDADE_MAXIMA_PRECO_MS = 3_600_000;

export interface RoboDoRetrato {
  readonly id: string;
  readonly nome: string;
  readonly simbolo: string;
  readonly quantidade: Valor;
  readonly precoMedio: Valor;
}

export interface SaidaComPerda {
  readonly em: number;
  readonly roboId: string;
}

/**
 * Fotografia de uma conta (pessoa + rede) para os limites da conta: soma os robôs dela
 * nessa rede. Roda na transação de quem chama, já sob RLS (comoUsuario).
 */
export interface RetratoConta {
  readonly rede: Rede;
  readonly robos: readonly RoboDoRetrato[];
  readonly realizadoDoDia: Valor;
  readonly naoRealizado: Valor;
  readonly exposicao: Valor;
  readonly posicoesAbertas: number;
  /** Resultados realizados (todas as execuções) desde `desde`. */
  readonly resultados: readonly ResultadoRealizado[];
  /** Vendas que realizaram perda desde `desde`. */
  readonly saidasComPerda: readonly SaidaComPerda[];
}

/** Último fechamento de 1 min de cada símbolo, se for recente. */
async function precosRecentes(
  tx: Executor,
  simbolos: readonly string[],
  agora: number,
): Promise<ReadonlyMap<string, Valor>> {
  if (simbolos.length === 0) return new Map();
  const linhas = await tx
    .selectDistinctOn([candles.simbolo], { simbolo: candles.simbolo, fecha: candles.fecha })
    .from(candles)
    .where(
      and(
        inArray(candles.simbolo, [...simbolos]),
        eq(candles.intervalo, "1m"),
        gte(candles.abertura, new Date(agora - IDADE_MAXIMA_PRECO_MS)),
      ),
    )
    .orderBy(candles.simbolo, desc(candles.abertura));
  return new Map(linhas.map((l) => [l.simbolo, dec(l.fecha)]));
}

const somar = (valores: readonly Valor[]): Valor => valores.reduce((a, b) => a.plus(b), dec(0));

function realizados(execs: ReadonlyMap<string, readonly Execucao[]>, ids: readonly string[]) {
  return ids.flatMap((id) => deltasRealizados(execs.get(id) ?? []).map((d) => ({ ...d, roboId: id })));
}

/**
 * Lê os robôs da rede, as execuções deles e os preços recentes, e soma: resultado do
 * dia (desde 00:00 UTC), não realizado, exposição (a preço atual, ou ao preço médio sem
 * preço recente) e posições abertas. `desde` corta os resultados e as perdas devolvidos.
 */
export async function retratoDaConta(
  tx: Executor,
  rede: Rede,
  agora: number,
  desde: number,
): Promise<RetratoConta> {
  const daRede = await tx
    .select({ id: robos.id, nome: robos.nome, simbolo: robos.simbolo })
    .from(robos)
    .where(eq(robos.rede, rede));
  const ids = daRede.map((r) => r.id);
  const execs = ids.length > 0 ? await execucoesPorRobo(tx) : new Map<string, Execucao[]>();
  const comPosicao = daRede.map((r) => {
    const p = posicaoDe(execs.get(r.id) ?? []);
    return { ...r, quantidade: p.quantidade, precoMedio: p.precoMedio };
  });
  const abertas = comPosicao.filter((r) => r.quantidade.gt(0));
  const precos = await precosRecentes(tx, [...new Set(abertas.map((r) => r.simbolo))], agora);
  const deltas = realizados(execs, ids);
  const inicioDia = inicioDoDiaUtc(agora);
  return {
    rede,
    robos: comPosicao,
    realizadoDoDia: somar(deltas.filter((d) => d.em >= inicioDia).map((d) => d.delta)),
    naoRealizado: somar(
      abertas.map((r) => {
        const preco = precos.get(r.simbolo);
        return preco ? preco.minus(r.precoMedio).times(r.quantidade) : dec(0);
      }),
    ),
    exposicao: somar(abertas.map((r) => r.quantidade.times(precos.get(r.simbolo) ?? r.precoMedio))),
    posicoesAbertas: abertas.length,
    resultados: deltas.filter((d) => d.em >= desde).map((d) => ({ em: d.em, delta: d.delta })),
    saidasComPerda: deltas
      .filter((d) => d.lado === "VENDA" && d.delta.isNegative() && d.em >= desde)
      .map((d) => ({ em: d.em, roboId: d.roboId })),
  };
}
