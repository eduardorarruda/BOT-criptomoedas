import { dec, type Valor } from "@zentrade/dominio";
import { diaParaNumero, diasCorridos, type Dia } from "./calendario.js";
import { ErroIndiceFaltando } from "./indexadores.js";
import {
  ErroTitulo,
  fatorBruto,
  type Indices,
  type Posicao,
  type PosicaoCalculada,
  type Titulo,
} from "./renda-fixa.js";

/** A carteira inteira: totais, alocação, rendimento no período e vencimentos. */

export interface Alocacao<T extends string> {
  readonly chave: T;
  readonly bruto: Valor;
  /** Fração do bruto total (0 a 1). */
  readonly fracao: Valor;
}

export interface Consolidado {
  readonly quantidade: number;
  /** Ids dos títulos sem posição (falta índice ou taxa). */
  readonly indisponiveis: readonly string[];
  readonly aplicado: Valor;
  readonly bruto: Valor;
  readonly iof: Valor;
  readonly ir: Valor;
  readonly liquido: Valor;
  readonly rendimentoBruto: Valor;
  readonly rendimentoLiquido: Valor;
  readonly rentabilidadeBrutaPct: Valor;
  readonly rentabilidadeLiquidaPct: Valor;
  readonly porTipo: readonly Alocacao<Titulo["tipo"]>[];
  readonly porIndexador: readonly Alocacao<Titulo["indexador"]>[];
  readonly proximoVencimento: { readonly tituloId: string; readonly nome: string; readonly dia: Dia } | null;
}

const ZERO = dec(0);
const somar = (lista: readonly PosicaoCalculada[], campo: (p: PosicaoCalculada) => Valor): Valor =>
  lista.reduce((s, p) => s.plus(campo(p)), ZERO);

function alocar<T extends string>(pares: readonly { chave: T; bruto: Valor }[], total: Valor): Alocacao<T>[] {
  const porChave = new Map<T, Valor>();
  for (const { chave, bruto } of pares) porChave.set(chave, (porChave.get(chave) ?? ZERO).plus(bruto));
  return [...porChave.entries()]
    .map(([chave, bruto]) => ({ chave, bruto, fracao: total.isZero() ? ZERO : bruto.div(total) }))
    .sort((a, b) => b.bruto.comparedTo(a.bruto));
}

export interface Vencimento {
  readonly tituloId: string;
  readonly nome: string;
  readonly dia: Dia;
  readonly diasCorridos: number;
}

/** Títulos que ainda vão vencer (vencimento a partir de hoje), do mais próximo ao mais distante. */
export function vencimentos(titulos: readonly Titulo[], hoje: Dia): Vencimento[] {
  return titulos
    .filter(
      (t): t is Titulo & { vencimento: Dia } =>
        t.vencimento !== null && diaParaNumero(t.vencimento) >= diaParaNumero(hoje),
    )
    .map((t) => ({
      tituloId: t.id,
      nome: t.nome,
      dia: t.vencimento,
      diasCorridos: diasCorridos(hoje, t.vencimento),
    }))
    .sort((a, b) => diaParaNumero(a.dia) - diaParaNumero(b.dia));
}

export function consolidar(titulos: readonly Titulo[], posicoes: readonly Posicao[], hoje: Dia): Consolidado {
  const calculadas = posicoes.filter((p): p is PosicaoCalculada => p.disponivel);
  const porId = new Map(titulos.map((t) => [t.id, t]));
  const aplicado = somar(calculadas, (p) => p.aplicado);
  const bruto = somar(calculadas, (p) => p.bruto);
  const liquido = somar(calculadas, (p) => p.liquido);
  const pct = (v: Valor): Valor => (aplicado.isZero() ? ZERO : v.div(aplicado).times(100));
  const pares = calculadas.flatMap((p) => {
    const t = porId.get(p.tituloId);
    return t ? [{ t, bruto: p.bruto }] : [];
  });
  const [proximo] = vencimentos(titulos, hoje);
  return {
    quantidade: titulos.length,
    indisponiveis: posicoes.filter((p) => !p.disponivel).map((p) => p.tituloId),
    aplicado,
    bruto,
    iof: somar(calculadas, (p) => p.iof),
    ir: somar(calculadas, (p) => p.ir),
    liquido,
    rendimentoBruto: bruto.minus(aplicado),
    rendimentoLiquido: liquido.minus(aplicado),
    rentabilidadeBrutaPct: pct(bruto.minus(aplicado)),
    rentabilidadeLiquidaPct: pct(liquido.minus(aplicado)),
    porTipo: alocar(
      pares.map(({ t, bruto: b }) => ({ chave: t.tipo, bruto: b })),
      bruto,
    ),
    porIndexador: alocar(
      pares.map(({ t, bruto: b }) => ({ chave: t.indexador, bruto: b })),
      bruto,
    ),
    proximoVencimento: proximo ? { tituloId: proximo.tituloId, nome: proximo.nome, dia: proximo.dia } : null,
  };
}

/**
 * Quanto o título rendeu (bruto) em [de, ate), pelos índices: bruto(ate) × (1 − F(início)/F(ate)),
 * com F medido desde a aplicação. Funciona igual para valores calculados e informados
 * pela instituição. `null` se faltar índice ou taxa.
 */
export function rendimentoNoPeriodo(
  t: Titulo,
  indices: Indices,
  de: Dia,
  ate: Dia,
  ipcaProjetadoAnual?: Valor,
): Valor | null {
  if (diaParaNumero(t.dataAplicacao) >= diaParaNumero(ate)) return ZERO;
  const inicio = diaParaNumero(t.dataAplicacao) > diaParaNumero(de) ? t.dataAplicacao : de;
  try {
    const total = fatorBruto(t, indices, t.dataAplicacao, ate, ipcaProjetadoAnual);
    const antes = fatorBruto(t, indices, t.dataAplicacao, inicio, ipcaProjetadoAnual);
    const brutoFim = t.informado?.bruto ?? t.valorAplicado.times(total.fator);
    return brutoFim.times(dec(1).minus(antes.fator.div(total.fator))).toDecimalPlaces(2);
  } catch (e) {
    if (e instanceof ErroIndiceFaltando || e instanceof ErroTitulo) return null;
    throw e;
  }
}
