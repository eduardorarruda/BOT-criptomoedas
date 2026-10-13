import {
  CLASSES_PATRIMONIO,
  type ClassePatrimonio,
  type ClassePatrimonioResumo,
  type Patrimonio,
} from "@zentrade/contratos/esquemas";
import { dec, paraTexto } from "@zentrade/dominio";
import { lerLista } from "../../componentes/filtros";
import { ROTULO_CLASSE, type FatiaClasse } from "./composicao";
import { type BuscaPatrimonio } from "./busca";

export * from "./busca";

/**
 * Quais classes entram na soma (todas, por padrão) e a visão (cartões ou tabela).
 * Nada de histórico nem bruto/líquido aqui: a API do patrimônio não traz esses
 * dados, e a tela não inventa.
 */

/** As classes escolhidas; nada escolhido = todas. */
export function classesEscolhidas(b: BuscaPatrimonio): readonly ClassePatrimonio[] {
  const lista = lerLista(b.classes, CLASSES_PATRIMONIO);
  return lista.length > 0 ? lista : CLASSES_PATRIMONIO;
}

export interface Soma {
  /** Soma, em reais, das classes escolhidas que têm valor. */
  readonly total: string;
  /** Alguma escolhida ficou de fora (sem valor em reais) ou entrou só em parte. */
  readonly parcial: boolean;
  /** Fatia de cada escolhida com valor positivo, sobre o total da soma. */
  readonly fatias: FatiaClasse[];
  readonly fracao: (classe: ClassePatrimonio) => string | null;
}

export function somarClasses(p: Patrimonio, escolhidas: readonly ClassePatrimonio[]): Soma {
  const dentro = p.classes.filter((c) => escolhidas.includes(c.classe));
  const comValor = dentro.filter((c): c is ClassePatrimonioResumo & { valor: string } => c.valor !== null);
  const total = comValor.reduce((s, c) => s.plus(c.valor), dec(0));
  const fracao = (classe: ClassePatrimonio): string | null => {
    const c = comValor.find((x) => x.classe === classe);
    if (!c || total.isZero()) return null;
    return paraTexto(dec(c.valor).div(total).toDecimalPlaces(10));
  };
  const fatias = comValor
    .filter((c) => dec(c.valor).gt(0))
    .map((c) => ({ classe: c.classe, rotulo: ROTULO_CLASSE[c.classe], fracao: fracao(c.classe) ?? "0" }));
  const parcial = dentro.some((c) => c.situacao === "parcial" || c.situacao === "indisponivel");
  return { total: paraTexto(total.toDecimalPlaces(2)), parcial, fatias, fracao };
}

/** Valor − investido, quando os dois existem (cripto não guarda o investido em reais). */
export function diferencaDaClasse(c: ClassePatrimonioResumo): string | null {
  if (c.valor === null || c.investido === null) return null;
  return paraTexto(dec(c.valor).minus(c.investido).toDecimalPlaces(2));
}
