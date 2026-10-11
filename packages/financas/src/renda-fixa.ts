import { dec, type Valor } from "@zentrade/dominio";
import { diaParaNumero, diasCorridos, diasUteis, listarDiasUteis, type Dia, type Mes } from "./calendario.js";
import { estimarImpostos, REGRAS_TRIBUTARIAS_VIGENTES, type RegrasTributarias } from "./impostos.js";
import { ErroIndiceFaltando, fatorDiario, fatorIpca, fatorPoupanca, fatorPrefixado } from "./indexadores.js";
import type { Indexador, Liquidez, TipoTitulo } from "./renda-fixa-tipos.js";

/**
 * Posição de um título de renda fixa: quanto foi aplicado, quanto vale hoje (bruto),
 * os impostos estimados e o líquido. Com valores da instituição (Pluggy), eles mandam;
 * sem eles, a conta sai dos índices do Banco Central. Sem índice, a posição diz o que
 * falta em vez de inventar.
 */

export interface PosicaoInformada {
  readonly em: Dia;
  readonly bruto: Valor;
  readonly liquido: Valor | null;
  readonly ir: Valor | null;
  readonly iof: Valor | null;
  readonly fonte: string;
}

export interface Titulo {
  readonly id: string;
  readonly tipo: TipoTitulo;
  readonly nome: string;
  readonly emissor: string | null;
  readonly indexador: Indexador;
  /** Percentual do índice (CDI ou Selic): 110 = 110%. */
  readonly percentualIndexador: Valor | null;
  /** Taxa fixa em % ao ano: o prefixado, a taxa real do IPCA+ ou o spread sobre CDI/Selic. */
  readonly taxaAnual: Valor | null;
  readonly dataAplicacao: Dia;
  readonly vencimento: Dia | null;
  readonly valorAplicado: Valor;
  readonly liquidez: Liquidez;
  readonly carenciaAte: Dia | null;
  readonly informado: PosicaoInformada | null;
  /** Lotes que a tela mostra juntos (ex.: as caixinhas do Nubank, um CDB por depósito). */
  readonly grupo: string | null;
}

export interface Indices {
  /** % ao dia, por dia útil (SGS 12). */
  readonly cdi: ReadonlyMap<Dia, Valor>;
  /** % ao dia, por dia útil (SGS 11). */
  readonly selic: ReadonlyMap<Dia, Valor>;
  /** % no mês (SGS 433). */
  readonly ipca: ReadonlyMap<Mes, Valor>;
  /** % no período, pela data de aniversário (SGS 195). */
  readonly poupanca: ReadonlyMap<Dia, Valor>;
}

export interface OpcoesPosicao {
  readonly hoje: Dia;
  readonly regras?: RegrasTributarias;
  /** Para o mês corrente do IPCA+, que o IBGE ainda não publicou. */
  readonly ipcaProjetadoAnual?: Valor;
}

export interface FatorTitulo {
  readonly fator: Valor;
  readonly ate: Dia;
  readonly avisos: readonly string[];
}

export class ErroTitulo extends Error {
  override name = "ErroTitulo";
}

const CEM = dec(100);
const TRUNCAR = 1; // Decimal.ROUND_DOWN
const formatarDia = (d: Dia): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const formatarPct = (v: Valor): string => v.toFixed().replace(".", ",");

function avisoParcial(nome: string, ate: Dia): string {
  return `Valor até ${formatarDia(ate)}: o ${nome} de ${formatarDia(ate)} em diante ainda não foi publicado pelo Banco Central.`;
}

function exigirTaxa(t: Titulo): Valor {
  if (t.taxaAnual === null)
    throw new ErroTitulo(`${t.nome}: falta a taxa anual do título para calcular o rendimento`);
  return t.taxaAnual;
}

function fatorPosFixado(t: Titulo, indices: Indices, de: Dia, ate: Dia): FatorTitulo {
  const ehCdi = t.indexador === "CDI";
  const r = fatorDiario(
    ehCdi ? indices.cdi : indices.selic,
    ehCdi ? "CDI" : "SELIC",
    de,
    ate,
    t.percentualIndexador ?? CEM,
  );
  const spread = t.taxaAnual === null ? dec(1) : fatorPrefixado(t.taxaAnual, r.diasUteis);
  return {
    fator: r.fator.times(spread),
    ate: r.ate,
    avisos: r.parcial ? [avisoParcial(ehCdi ? "CDI" : "Selic", r.ate)] : [],
  };
}

function fatorIpcaMais(t: Titulo, indices: Indices, de: Dia, ate: Dia, projecao?: Valor): FatorTitulo {
  const inflacao = fatorIpca(indices.ipca, de, ate, projecao);
  const real = fatorPrefixado(t.taxaAnual ?? dec(0), diasUteis(de, ate));
  const avisos = inflacao.mesesProjetados.map(
    (m) =>
      `IPCA de ${m} ainda não publicado: usamos a projeção de ${formatarPct(projecao ?? dec(0))}% ao ano informada.`,
  );
  return { fator: inflacao.fator.times(real), ate, avisos };
}

/** Fator bruto do título entre `de` e `ate` (fim exclusivo). Lança ErroIndiceFaltando ou ErroTitulo. */
export function fatorBruto(
  t: Titulo,
  indices: Indices,
  de: Dia,
  ate: Dia,
  ipcaProjetadoAnual?: Valor,
): FatorTitulo {
  switch (t.indexador) {
    case "CDI":
    case "SELIC":
      return fatorPosFixado(t, indices, de, ate);
    case "PREFIXADO":
      return { fator: fatorPrefixado(exigirTaxa(t), diasUteis(de, ate)), ate, avisos: [] };
    case "IPCA":
      return fatorIpcaMais(t, indices, de, ate, ipcaProjetadoAnual);
    case "POUPANCA":
      return { fator: fatorPoupanca(indices.poupanca, de, ate).fator, ate, avisos: [] };
  }
}

/**
 * Percentual do CDI que, aplicado dia a dia no mesmo período, daria o mesmo fator.
 * É uma métrica de comparação (não dinheiro): a busca usa número de ponto flutuante
 * e devolve duas casas.
 */
export function percentualDoCdiEquivalente(
  fator: Valor,
  cdi: ReadonlyMap<Dia, Valor>,
  de: Dia,
  ate: Dia,
): Valor | null {
  const taxas = listarDiasUteis(de, ate).map((d) => cdi.get(d));
  if (taxas.length === 0 || taxas.some((t) => t === undefined)) return null;
  const diarias = (taxas as Valor[]).map((t) => t.toNumber() / 100);
  const alvo = Math.log(fator.toNumber());
  const logFator = (p: number): number => diarias.reduce((s, d) => s + Math.log1p(d * p), 0);
  let [baixo, alto] = [-5, 50];
  for (let i = 0; i < 100; i++) {
    const meio = (baixo + alto) / 2;
    if (logFator(meio) < alvo) baixo = meio;
    else alto = meio;
  }
  return dec(((baixo + alto) / 2) * 100).toDecimalPlaces(2);
}

export interface PosicaoCalculada {
  readonly disponivel: true;
  readonly tituloId: string;
  readonly fonte: "indices" | "instituicao";
  /** Data da posição (fim exclusivo da conta: o rendimento deste dia ainda não entrou). */
  readonly ate: Dia;
  readonly vencido: boolean;
  readonly aplicado: Valor;
  readonly bruto: Valor;
  readonly iof: Valor;
  readonly ir: Valor;
  readonly liquido: Valor;
  readonly rendimentoBruto: Valor;
  readonly rendimentoLiquido: Valor;
  readonly rentabilidadeBrutaPct: Valor;
  readonly rentabilidadeLiquidaPct: Valor;
  readonly aliquotaIr: Valor;
  readonly aliquotaIof: Valor;
  readonly isentoIr: boolean;
  readonly diasCorridos: number;
  readonly diasUteis: number;
  /** CDI acumulado no período, em %. `null` se faltar CDI. */
  readonly cdiPeriodoPct: Valor | null;
  /** Rendimento bruto expresso em % do CDI do mesmo período. */
  readonly percentualDoCdi: Valor | null;
  /** Quanto a poupança teria rendido no período, em % (só aniversários completos). */
  readonly poupancaPeriodoPct: Valor | null;
  readonly avisos: readonly string[];
}

export interface PosicaoIndisponivel {
  readonly disponivel: false;
  readonly tituloId: string;
  readonly aplicado: Valor;
  readonly motivo: string;
}

export type Posicao = PosicaoCalculada | PosicaoIndisponivel;

const AVISO_TESOURO =
  "Tesouro: valor na curva (pela taxa da compra). O preço de mercado do Tesouro Direto pode ser outro, e a B3 cobra taxa de custódia de 0,20% ao ano (isenta no Tesouro Selic até R$ 10 mil).";

interface Bruto {
  readonly bruto: Valor;
  /** Fator sem arredondar (só quando a conta sai dos índices). */
  readonly fator: Valor | null;
  readonly ate: Dia;
  readonly fonte: "indices" | "instituicao";
  readonly avisos: readonly string[];
}

function brutoDoTitulo(t: Titulo, indices: Indices, fim: Dia, o: OpcoesPosicao): Bruto {
  if (t.informado)
    return { bruto: t.informado.bruto, fator: null, ate: t.informado.em, fonte: "instituicao", avisos: [] };
  const f = fatorBruto(t, indices, t.dataAplicacao, fim, o.ipcaProjetadoAnual);
  return {
    bruto: t.valorAplicado.times(f.fator).toDecimalPlaces(2, TRUNCAR),
    fator: f.fator,
    ate: f.ate,
    fonte: "indices",
    avisos: f.avisos,
  };
}

function comparacoes(t: Titulo, indices: Indices, b: Bruto) {
  const { ate } = b;
  const fatorTitulo = b.fator ?? (t.valorAplicado.isZero() ? null : b.bruto.div(t.valorAplicado));
  let cdiPeriodoPct: Valor | null = null;
  let percentualDoCdi: Valor | null = null;
  let poupancaPeriodoPct: Valor | null = null;
  try {
    const cdi = fatorDiario(indices.cdi, "CDI", t.dataAplicacao, ate);
    cdiPeriodoPct = cdi.fator.minus(1).times(CEM);
    if (fatorTitulo)
      percentualDoCdi = percentualDoCdiEquivalente(fatorTitulo, indices.cdi, t.dataAplicacao, cdi.ate);
  } catch (e) {
    if (!(e instanceof ErroIndiceFaltando)) throw e;
  }
  try {
    poupancaPeriodoPct = fatorPoupanca(indices.poupanca, t.dataAplicacao, ate).fator.minus(1).times(CEM);
  } catch (e) {
    if (!(e instanceof ErroIndiceFaltando)) throw e;
  }
  return { cdiPeriodoPct, percentualDoCdi, poupancaPeriodoPct };
}

function montarPosicao(t: Titulo, indices: Indices, b: Bruto, o: OpcoesPosicao): PosicaoCalculada {
  const dias = Math.max(diasCorridos(t.dataAplicacao, b.ate), 0);
  const est = estimarImpostos(
    { tipo: t.tipo, aplicado: t.valorAplicado, bruto: b.bruto, diasCorridos: dias },
    o.regras ?? REGRAS_TRIBUTARIAS_VIGENTES,
  );
  const iof = t.informado?.iof ?? est.iof;
  const ir = t.informado?.ir ?? est.ir;
  const liquido = t.informado?.liquido ?? b.bruto.minus(iof).minus(ir);
  const comp = comparacoes(t, indices, b);
  const pct = (v: Valor): Valor => (t.valorAplicado.isZero() ? dec(0) : v.div(t.valorAplicado).times(CEM));
  const avisos = [...b.avisos];
  if (comp.percentualDoCdi === null)
    avisos.push("Sem CDI publicado para todo o período: a comparação com o CDI fica de fora.");
  if (t.tipo.startsWith("TESOURO_") && b.fonte === "indices") avisos.push(AVISO_TESOURO);
  return {
    disponivel: true,
    tituloId: t.id,
    fonte: b.fonte,
    ate: b.ate,
    vencido: t.vencimento !== null && diaParaNumero(t.vencimento) <= diaParaNumero(o.hoje),
    aplicado: t.valorAplicado,
    bruto: b.bruto,
    iof,
    ir,
    liquido,
    rendimentoBruto: b.bruto.minus(t.valorAplicado),
    rendimentoLiquido: liquido.minus(t.valorAplicado),
    rentabilidadeBrutaPct: pct(b.bruto.minus(t.valorAplicado)),
    rentabilidadeLiquidaPct: pct(liquido.minus(t.valorAplicado)),
    aliquotaIr: est.aliquotaIr,
    aliquotaIof: est.aliquotaIof,
    isentoIr: est.isentoIr,
    diasCorridos: dias,
    diasUteis: diasUteis(t.dataAplicacao, b.ate),
    ...comp,
    avisos,
  };
}

/** A posição do título em `hoje` (ou no vencimento, se já venceu). */
export function posicaoDoTitulo(t: Titulo, indices: Indices, o: OpcoesPosicao): Posicao {
  const fim =
    t.vencimento !== null && diaParaNumero(t.vencimento) < diaParaNumero(o.hoje) ? t.vencimento : o.hoje;
  try {
    return montarPosicao(t, indices, brutoDoTitulo(t, indices, fim, o), o);
  } catch (e) {
    if (e instanceof ErroIndiceFaltando || e instanceof ErroTitulo) {
      return { disponivel: false, tituloId: t.id, aplicado: t.valorAplicado, motivo: e.message };
    }
    throw e;
  }
}
