import type { MoedaCarteira, ResumoParcela } from "@zentrade/contratos/esquemas";
import { dec, paraTexto } from "@zentrade/dominio";
import { contemTexto } from "../../componentes/filtros";
import type { Ordem, Parcela } from "./tabela";
import { type BuscaCarteira } from "./busca";

export * from "./busca";

/**
 * Filtros da carteira cripto: conta (rede), parcela (robô/manual), moeda, só com
 * saldo, com resultado realizado; ordem pela coluna; visão em tabela, cartões ou
 * alocação. E os totais recalculados para as moedas que passaram no filtro.
 */

/** A parcela é uma lente (não esconde moedas): não conta como filtro. */
export const NAO_CONTAM: readonly string[] = ["ordem", "dir", "visao", "parcela"];

/** Tem saldo na conta (inclui USDT, que é caixa). */
export const temSaldo = (m: MoedaCarteira): boolean => dec(m.saldo.total).gt(0);

/** Já vendeu algo nesta parcela: há resultado realizado (ganho ou perda). */
export const temRealizado = (m: MoedaCarteira, parcela: Parcela): boolean =>
  !m.referencia && !dec(m[parcela].resultadoRealizadoBruto).isZero();

export function predicadosCarteira(
  b: BuscaCarteira,
  parcela: Parcela,
): Record<string, (m: MoedaCarteira) => boolean> {
  const p: Record<string, (m: MoedaCarteira) => boolean> = {};
  if (b.q) p.q = (m) => contemTexto(b.q, [m.ativo]);
  if (b.saldo) p.saldo = temSaldo;
  if (b.realizado) p.realizado = (m) => temRealizado(m, parcela);
  if (b.avisos) p.avisos = (m) => m.avisos.length > 0;
  return p;
}

/** A ordem que vale: a da URL ou a padrão (maior fatia da conta primeiro). */
export function ordemDaBusca(b: BuscaCarteira): Ordem {
  const coluna = b.ordem ?? "alocacao";
  return { coluna, direcao: b.dir ?? (coluna === "ativo" ? "asc" : "desc") };
}

/**
 * Totais de uma parcela somando só as moedas dadas (a de referência fica de fora,
 * como na API). Retorno = resultado líquido ÷ total comprado.
 */
export function resumirMoedas(moedas: readonly MoedaCarteira[], parcela: Parcela): ResumoParcela {
  const ps = moedas.filter((m) => !m.referencia).map((m) => m[parcela]);
  const somar = (ler: (p: (typeof ps)[number]) => string | null) =>
    ps.reduce((s, p) => s.plus(dec(ler(p) ?? "0")), dec(0));
  const naoRealizado = somar((p) => p.resultadoNaoRealizado);
  const realizadoBruto = somar((p) => p.resultadoRealizadoBruto);
  const realizadoLiquido = somar((p) => p.resultadoRealizadoLiquido);
  const comprado = somar((p) => p.custoComprado);
  const liquido = realizadoLiquido.plus(naoRealizado);
  const t = (v: ReturnType<typeof dec>) => paraTexto(v.toDecimalPlaces(8));
  return {
    custoComprado: t(comprado),
    custoPosicao: t(somar((p) => p.custoPosicao)),
    valorAtual: t(somar((p) => p.valorAtual)),
    resultadoRealizadoBruto: t(realizadoBruto),
    resultadoRealizadoLiquido: t(realizadoLiquido),
    resultadoNaoRealizado: t(naoRealizado),
    resultadoBruto: t(realizadoBruto.plus(naoRealizado)),
    resultadoLiquido: t(liquido),
    taxas: t(somar((p) => p.taxas)),
    retorno: comprado.isZero() ? null : paraTexto(liquido.div(comprado).toDecimalPlaces(10)),
  };
}
