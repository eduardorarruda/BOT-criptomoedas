import { MS_POR_INTERVALO } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import type { BarraMil, ContratoNoDia, DiaDeNegocios } from "./negocios-dia.js";

/**
 * Do arquivo de negócios (vários vencimentos do WIN no mesmo dia) para a série contínua
 * `WIN`: cada dia usa um contrato só, o mais negociado do dia (o "cheio"). O backtest do
 * WIN zera no fim do pregão, então nunca atravessa a troca de contrato posicionado.
 *
 * Na rolagem (o dia em que o cheio muda, como WINV26 → WINZ26), o preço salta a diferença
 * entre os vencimentos (juros até o vencimento, a base). Dentro do dia isso não importa;
 * entre dias, distorce indicador que olha para trás além do pregão (EMA longa, Donchian,
 * máxima de N dias). Com `diferenca`, os dias antes de cada rolagem andam essa diferença
 * (ajuste para trás: o contrato atual fica com os preços de verdade). Com `nenhum`
 * (padrão), cada dia guarda os preços negociados de verdade.
 */
export const AJUSTES_ROLAGEM = ["nenhum", "diferenca"] as const;
export type AjusteRolagem = (typeof AJUSTES_ROLAGEM)[number];

export interface Rolagem {
  /** Primeiro dia com o contrato novo. */
  readonly data: string;
  readonly de: string;
  readonly para: string;
  /** Fechamento do novo − fechamento do antigo, em milésimos; null se não deu para medir. */
  readonly diferencaMil: number | null;
  /** O dia dos dois fechamentos usados. */
  readonly referencia: string | null;
}

export interface DiaMontado {
  readonly data: string;
  readonly contrato: ContratoNoDia;
  /** Quanto os preços do dia andaram pelo ajuste, em milésimos (0 sem ajuste). */
  readonly deslocamentoMil: number;
  readonly candles: Candle[];
}

export interface SerieWin {
  readonly dias: readonly DiaMontado[];
  readonly rolagens: readonly Rolagem[];
}

const M5 = MS_POR_INTERVALO["5m"];

/** O contrato com mais contratos negociados no dia (a lista já vem nessa ordem). */
export const contratoDoDia = (dia: DiaDeNegocios): ContratoNoDia | undefined =>
  dia.contratos.find((c) => c.quantidade > 0);

/** Fechamento do contrato no pregão regular do dia: o da última barra. */
const fechamento = (dia: DiaDeNegocios, instrumento: string): number | undefined =>
  dia.contratos.find((c) => c.instrumento === instrumento)?.barras.at(-1)?.fechaMil;

/** A diferença entre os dois vencimentos, no dia anterior (de preferência) ou no da rolagem. */
function medirRolagem(anterior: DiaDeNegocios, atual: DiaDeNegocios, de: string, para: string): Rolagem {
  for (const d of [anterior, atual]) {
    const velho = fechamento(d, de);
    const novo = fechamento(d, para);
    if (velho !== undefined && novo !== undefined)
      return { data: atual.data, de, para, diferencaMil: novo - velho, referencia: d.data };
  }
  return { data: atual.data, de, para, diferencaMil: null, referencia: null };
}

const pontos = (mil: number) => dec(mil).div(1000);

function paraCandle(b: BarraMil, deslocamentoMil: number): Candle {
  return {
    abertura: b.abertura,
    fechamento: b.abertura + M5 - 1,
    abre: pontos(b.abreMil + deslocamentoMil),
    maxima: pontos(b.maximaMil + deslocamentoMil),
    minima: pontos(b.minimaMil + deslocamentoMil),
    fecha: pontos(b.fechaMil + deslocamentoMil),
    volume: dec(b.volume),
  };
}

export function montarSerie(dias: readonly DiaDeNegocios[], ajuste: AjusteRolagem): SerieWin {
  const escolhidos = [...dias]
    .sort((a, b) => a.data.localeCompare(b.data))
    .flatMap((d) => {
      const contrato = contratoDoDia(d);
      return contrato ? [{ dia: d, contrato }] : [];
    });
  const rolagens = escolhidos.flatMap((e, i) => {
    const anterior = escolhidos[i - 1];
    if (!anterior || anterior.contrato.instrumento === e.contrato.instrumento) return [];
    return [medirRolagem(anterior.dia, e.dia, anterior.contrato.instrumento, e.contrato.instrumento)];
  });
  // Para trás: o último dia fica como está; cada rolagem soma a diferença aos dias antes dela.
  const deslocamentos = escolhidos.map((e) =>
    ajuste === "nenhum"
      ? 0
      : rolagens.filter((r) => r.data > e.dia.data).reduce((s, r) => s + (r.diferencaMil ?? 0), 0),
  );
  return {
    dias: escolhidos.map((e, i) => {
      const deslocamentoMil = deslocamentos[i] ?? 0;
      return {
        data: e.dia.data,
        contrato: e.contrato,
        deslocamentoMil,
        candles: e.contrato.barras.map((b) => paraCandle(b, deslocamentoMil)),
      };
    }),
    rolagens,
  };
}
