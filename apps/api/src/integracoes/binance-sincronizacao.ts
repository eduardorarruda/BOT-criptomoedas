import type { NegociacaoCarteiraGravada, RepositorioCarteira } from "@zentrade/banco";
import type { RedeConta, Sincronizacao } from "@zentrade/contratos";
import {
  ErroCorretora,
  ErroLimiteRequisicoes,
  importarNegociacoes,
  type AtivosDoPar,
  type NegociacaoImportada,
  type SaldoBinance,
} from "@zentrade/corretora";
import { erroDaBinance, type ContaLeitura } from "./binance-conta.js";

/**
 * A Binance só lista negociações por par: não há "todas as minhas negociações". Os
 * pares candidatos são as moedas do saldo com as cotações mais comuns, os pares já
 * vistos antes, os dos robôs da pessoa e os que ela pedir.
 */
export const COTACOES_COMUNS = ["USDT", "FDUSD", "USDC", "BRL", "BTC", "ETH", "BNB", "EUR", "TRY"] as const;

export interface EntradaCandidatos {
  readonly ativos: readonly string[];
  readonly conhecidos: readonly string[];
  readonly robos: readonly string[];
  readonly extras: readonly string[];
  readonly pares: ReadonlyMap<string, AtivosDoPar>;
}

export function simbolosCandidatos(e: EntradaCandidatos): { simbolos: string[]; avisos: string[] } {
  const doSaldo = e.ativos.flatMap((a) => COTACOES_COMUNS.map((q) => `${a}${q}`));
  const inexistentes = e.extras.filter((s) => !e.pares.has(s));
  const todos = [...doSaldo, ...e.conhecidos, ...e.robos, ...e.extras].filter((s) => e.pares.has(s));
  return {
    simbolos: [...new Set(todos)].sort(),
    avisos: inexistentes.map((s) => `O par ${s} não existe na Binance; confira o nome (ex.: BTCUSDT).`),
  };
}

export type RepositorioSincronizacao = Pick<
  RepositorioCarteira,
  "gravarNegociacoes" | "gravarSaldos" | "registrarSincronizacao" | "sincronizacao" | "ultimosIds"
>;

export interface ContextoSincronizacao {
  readonly conta: ContaLeitura;
  readonly carteira: RepositorioSincronizacao;
  readonly agora: () => number;
}

export interface PedidoConta {
  readonly usuarioId: string;
  readonly rede: RedeConta;
  readonly extras: readonly string[];
  readonly robos: readonly string[];
}

const paraGravar = (n: NegociacaoImportada): NegociacaoCarteiraGravada => ({
  ...n,
  idOrdem: Number(n.idOrdem),
});

interface Progresso {
  readonly novas: number;
  readonly comNegociacao: readonly string[];
  readonly avisos: readonly string[];
  readonly parcial: boolean;
}

async function importarPar(
  ctx: ContextoSincronizacao,
  p: PedidoConta,
  simbolo: string,
  par: AtivosDoPar,
  desde: number,
): Promise<{ novas: number; viu: boolean }> {
  const brutas = await ctx.conta.negociacoes(simbolo, desde);
  const importadas = await importarNegociacoes(ctx.conta, par, brutas);
  const novas = await ctx.carteira.gravarNegociacoes(p.usuarioId, p.rede, importadas.map(paraGravar));
  return { novas, viu: brutas.length > 0 || desde > 0 };
}

/** Importa par a par. Cada par gravado fica gravado: se parar no meio, a próxima continua dali. */
async function importarPares(
  ctx: ContextoSincronizacao,
  p: PedidoConta,
  simbolos: readonly string[],
  pares: ReadonlyMap<string, AtivosDoPar>,
): Promise<Progresso> {
  const ultimos = await ctx.carteira.ultimosIds(p.usuarioId, p.rede);
  let prog: Progresso = { novas: 0, comNegociacao: [], avisos: [], parcial: false };
  for (const simbolo of simbolos) {
    const par = pares.get(simbolo);
    if (!par) continue;
    try {
      const r = await importarPar(ctx, p, simbolo, par, (ultimos.get(simbolo) ?? -1) + 1);
      prog = {
        ...prog,
        novas: prog.novas + r.novas,
        comNegociacao: r.viu ? [...prog.comNegociacao, simbolo] : prog.comNegociacao,
      };
    } catch (erro) {
      // A Binance recusou só este par (ex.: par fora de negociação): segue com os outros.
      if (erro instanceof ErroCorretora && erro.codigo !== null && !(erro instanceof ErroLimiteRequisicoes)) {
        prog = { ...prog, avisos: [...prog.avisos, `${simbolo}: ${erro.message}`] };
        continue;
      }
      const motivo = erroDaBinance(erro).message;
      return {
        ...prog,
        parcial: true,
        avisos: [
          ...prog.avisos,
          `Parou em ${simbolo}: ${motivo} O que já entrou fica; a próxima sincronização continua dali.`,
        ],
      };
    }
  }
  return prog;
}

async function registrarFalha(ctx: ContextoSincronizacao, p: PedidoConta, erro: unknown): Promise<never> {
  const api = erroDaBinance(erro);
  await ctx.carteira.registrarSincronizacao(p.usuarioId, p.rede, {
    em: ctx.agora(),
    ok: false,
    erro: api.message,
    negociacoes: 0,
    simbolos: [],
  });
  throw api;
}

async function lerConta(ctx: ContextoSincronizacao, p: PedidoConta) {
  try {
    const [{ saldos }, pares] = await Promise.all([ctx.conta.conta(), ctx.conta.pares()]);
    return { saldos, pares };
  } catch (erro) {
    return registrarFalha(ctx, p, erro);
  }
}

const ativosDe = (saldos: readonly SaldoBinance[]) => saldos.map((s) => s.ativo);

/**
 * Sincroniza a conta da pessoa numa rede: saldos (a foto inteira) e as negociações
 * novas de cada par candidato, idempotente pelo id da negociação. A origem (robô ou
 * manual) vem do clientOrderId; taxas e cotações são convertidas para USDT do instante.
 */
export async function sincronizarConta(ctx: ContextoSincronizacao, p: PedidoConta): Promise<Sincronizacao> {
  const { saldos, pares } = await lerConta(ctx, p);
  const anterior = await ctx.carteira.sincronizacao(p.usuarioId, p.rede);
  const candidatos = simbolosCandidatos({
    ativos: ativosDe(saldos),
    conhecidos: anterior?.simbolos ?? [],
    robos: p.robos,
    extras: p.extras,
    pares,
  });
  const prog = await importarPares(ctx, p, candidatos.simbolos, pares);
  const em = ctx.agora();
  await ctx.carteira.gravarSaldos(p.usuarioId, p.rede, saldos, em);
  const avisos = [...candidatos.avisos, ...prog.avisos];
  await ctx.carteira.registrarSincronizacao(p.usuarioId, p.rede, {
    em,
    ok: !prog.parcial,
    erro: prog.parcial ? (prog.avisos.at(-1) ?? null) : null,
    negociacoes: prog.novas,
    simbolos: [...(anterior?.simbolos ?? []), ...prog.comNegociacao],
  });
  return {
    rede: p.rede,
    em,
    negociacoesNovas: prog.novas,
    simbolos: candidatos.simbolos,
    saldos: saldos.length,
    parcial: prog.parcial,
    avisos,
  };
}
