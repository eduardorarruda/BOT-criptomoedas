import { dec, type Valor } from "@zentrade/dominio";
import { diaParaNumero, diasCorridos, diasUteis, somarMeses, type Dia, type Mes } from "./calendario.js";
import { estimarImpostos, REGRAS_TRIBUTARIAS_VIGENTES, type RegrasTributarias } from "./impostos.js";
import { aniversarioPoupanca, fatorPrefixado, taxaAnualDeDiaria, taxaDiariaDeAnual } from "./indexadores.js";
import type { Indices, PosicaoCalculada, Titulo } from "./renda-fixa.js";

/**
 * Projeção de um título até o vencimento. Projeção não é promessa: cada premissa
 * aparece por extenso na resposta, e sem premissa (índice não publicado e nada
 * informado) não há projeção.
 */

export interface Premissa {
  readonly valor: Valor;
  readonly descricao: string;
}

export interface Premissas {
  /** % ao ano. */
  readonly cdiAnual: Premissa | null;
  readonly selicAnual: Premissa | null;
  readonly ipcaAnual: Premissa | null;
  /** % ao mês. */
  readonly poupancaMensal: Premissa | null;
}

const UM = dec(1);
const CEM = dec(100);
const TRUNCAR = 1; // Decimal.ROUND_DOWN
const pct = (v: Valor, casas = 2): string => v.toDecimalPlaces(casas).toFixed().replace(".", ",");
const formatarDia = (d: Dia): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function ultimo<K extends string>(serie: ReadonlyMap<K, Valor>, ate: K): [K, Valor] | null {
  let achado: [K, Valor] | null = null;
  for (const [k, v] of serie) if (k <= ate && (achado === null || k > achado[0])) achado = [k, v];
  return achado;
}

function premissaDiaria(serie: ReadonlyMap<Dia, Valor>, hoje: Dia, nome: string): Premissa | null {
  const u = ultimo(serie, hoje);
  if (!u) return null;
  const anual = taxaAnualDeDiaria(u[1]);
  return {
    valor: anual,
    descricao: `${nome} de ${pct(anual)}% ao ano, o último publicado (${formatarDia(u[0])}), mantido até o fim`,
  };
}

function premissaIpca(ipca: ReadonlyMap<Mes, Valor>, hoje: Dia): Premissa | null {
  const u = ultimo(ipca, hoje.slice(0, 7));
  if (!u) return null;
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(`${u[0]}-01`, -i).slice(0, 7));
  if (meses.some((m) => !ipca.has(m))) return null;
  const anual = meses
    .reduce((f, m) => f.times(UM.plus((ipca.get(m) as Valor).div(CEM))), UM)
    .minus(1)
    .times(CEM);
  const [ano, mes] = u[0].split("-");
  return {
    valor: anual,
    descricao: `IPCA de ${pct(anual)}% ao ano: o acumulado dos 12 meses até ${mes}/${ano}, mantido até o fim`,
  };
}

/** Premissas a partir do que o Banco Central já publicou. Sem dado, a premissa fica `null`. */
export function premissasDosIndices(indices: Indices, hoje: Dia): Premissas {
  const poupanca = ultimo(indices.poupanca, hoje);
  return {
    cdiAnual: premissaDiaria(indices.cdi, hoje, "CDI"),
    selicAnual: premissaDiaria(indices.selic, hoje, "Selic"),
    ipcaAnual: premissaIpca(indices.ipca, hoje),
    poupancaMensal: poupanca
      ? {
          valor: poupanca[1],
          descricao: `Poupança rendendo ${pct(poupanca[1], 4)}% ao mês, a última publicada (aniversário ${formatarDia(poupanca[0])}), mantida até o fim`,
        }
      : null,
  };
}

export interface PremissasInformadas {
  readonly cdiAnual?: Valor;
  readonly selicAnual?: Valor;
  readonly ipcaAnual?: Valor;
}

/** Troca as premissas pelas que a pessoa informou. */
export function comPremissasInformadas(p: Premissas, i: PremissasInformadas): Premissas {
  const informada = (nome: string, v: Valor | undefined, atual: Premissa | null): Premissa | null =>
    v === undefined ? atual : { valor: v, descricao: `${nome} de ${pct(v)}% ao ano, informado por você` };
  return {
    ...p,
    cdiAnual: informada("CDI", i.cdiAnual, p.cdiAnual),
    selicAnual: informada("Selic", i.selicAnual, p.selicAnual),
    ipcaAnual: informada("IPCA", i.ipcaAnual, p.ipcaAnual),
  };
}

export interface PontoProjecao {
  readonly dia: Dia;
  readonly bruto: Valor;
  readonly iof: Valor;
  readonly ir: Valor;
  readonly liquido: Valor;
  readonly aliquotaIr: Valor;
}

export type Projecao =
  | {
      readonly disponivel: true;
      readonly fim: Dia;
      readonly pontos: readonly PontoProjecao[];
      readonly premissas: readonly string[];
    }
  | { readonly disponivel: false; readonly motivo: string };

interface Regra {
  readonly fator: (de: Dia, ate: Dia) => Valor;
  readonly premissas: readonly string[];
}

const falta = (o: string): string =>
  `Para projetar, falta a premissa de ${o}: o Banco Central ainda não publicou o índice e nada foi informado.`;

function regraPosFixada(t: Titulo, p: Premissa, nome: string): Regra {
  const percentual = t.percentualIndexador ?? CEM;
  const diaria = taxaDiariaDeAnual(p.valor).div(CEM).times(percentual.div(CEM));
  const spread = t.taxaAnual;
  const texto = `${pct(percentual)}% do ${nome}${spread ? ` + ${pct(spread)}% ao ano` : ""}`;
  return {
    fator: (de, ate) => {
      const du = diasUteis(de, ate);
      return UM.plus(diaria)
        .pow(du)
        .times(spread ? fatorPrefixado(spread, du) : UM);
    },
    premissas: [`Rende ${texto}.`, `${p.descricao}.`],
  };
}

function anivers(t: Titulo, de: Dia, ate: Dia): number {
  const base = aniversarioPoupanca(t.dataAplicacao);
  let n = 0;
  for (let k = 1; diaParaNumero(somarMeses(base, k)) <= diaParaNumero(ate); k++) {
    if (diaParaNumero(somarMeses(base, k)) > diaParaNumero(de)) n++;
  }
  return n;
}

function regraDoTitulo(t: Titulo, p: Premissas): Regra | string {
  switch (t.indexador) {
    case "CDI":
      return p.cdiAnual ? regraPosFixada(t, p.cdiAnual, "CDI") : falta("CDI");
    case "SELIC":
      return p.selicAnual ? regraPosFixada(t, p.selicAnual, "Selic") : falta("Selic");
    case "PREFIXADO": {
      const taxa = t.taxaAnual;
      if (!taxa) return "Para projetar, falta a taxa anual do título.";
      return {
        fator: (de, ate) => fatorPrefixado(taxa, diasUteis(de, ate)),
        premissas: [`Prefixado a ${pct(taxa)}% ao ano.`],
      };
    }
    case "IPCA": {
      const ipca = p.ipcaAnual;
      if (!ipca) return falta("IPCA");
      const real = t.taxaAnual ?? dec(0);
      return {
        fator: (de, ate) =>
          fatorPrefixado(ipca.valor, diasUteis(de, ate)).times(fatorPrefixado(real, diasUteis(de, ate))),
        premissas: [`IPCA + ${pct(real)}% ao ano.`, `${ipca.descricao}, distribuído pelos dias úteis.`],
      };
    }
    case "POUPANCA": {
      const mensal = p.poupancaMensal;
      if (!mensal) return falta("rentabilidade da poupança");
      return {
        fator: (de, ate) => UM.plus(mensal.valor.div(CEM)).pow(anivers(t, de, ate)),
        premissas: [`${mensal.descricao}; só rende no aniversário.`],
      };
    }
  }
}

function datasDaProjecao(inicio: Dia, fim: Dia): Dia[] {
  const datas: Dia[] = [];
  for (let k = 0; diaParaNumero(somarMeses(inicio, k)) < diaParaNumero(fim); k++)
    datas.push(somarMeses(inicio, k));
  return [...datas, fim];
}

export interface OpcoesProjecao {
  /** Até quando projetar quando o título não vence (padrão: 12 meses). */
  readonly horizonteMeses?: number;
  readonly regras?: RegrasTributarias;
}

/** Projeta do dia da posição até o vencimento (ou o horizonte), mês a mês, com os impostos de cada data. */
export function projetar(
  t: Titulo,
  posicao: PosicaoCalculada,
  premissas: Premissas,
  o: OpcoesProjecao = {},
): Projecao {
  const inicio = posicao.ate;
  if (t.vencimento !== null && diaParaNumero(t.vencimento) <= diaParaNumero(inicio)) {
    return { disponivel: false, motivo: "O título já venceu: não há o que projetar." };
  }
  const regra = regraDoTitulo(t, premissas);
  if (typeof regra === "string") return { disponivel: false, motivo: regra };
  const regras = o.regras ?? REGRAS_TRIBUTARIAS_VIGENTES;
  const fim = t.vencimento ?? somarMeses(inicio, o.horizonteMeses ?? 12);
  const pontos = datasDaProjecao(inicio, fim).map((dia): PontoProjecao => {
    const bruto = posicao.bruto.times(regra.fator(inicio, dia)).toDecimalPlaces(2, TRUNCAR);
    const imp = estimarImpostos(
      {
        tipo: t.tipo,
        aplicado: t.valorAplicado,
        bruto,
        diasCorridos: Math.max(diasCorridos(t.dataAplicacao, dia), 0),
      },
      regras,
    );
    return { dia, bruto, iof: imp.iof, ir: imp.ir, liquido: imp.liquido, aliquotaIr: imp.aliquotaIr };
  });
  return {
    disponivel: true,
    fim,
    pontos,
    premissas: [
      ...regra.premissas,
      `Parte do valor bruto de ${formatarDia(inicio)} (${posicao.fonte === "instituicao" ? "informado pela instituição" : "calculado pelos índices"}).`,
      `IR pela tabela regressiva (${regras.ir.fonte}) e IOF nos primeiros 30 dias, conferidos em ${formatarDia(regras.verificadoEm)}.`,
      "Sem aplicações nem resgates no caminho. Projeção não é promessa de rentabilidade.",
    ],
  };
}
