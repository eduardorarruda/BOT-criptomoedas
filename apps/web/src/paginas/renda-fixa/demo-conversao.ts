import type {
  Indicadores,
  PosicaoTitulo,
  ProjecaoTitulo,
  RegrasTributariasDTO,
  ResultadoIsento,
  ResultadoPreIpca,
  ResultadoSelicCdbPoupanca,
} from "@zentrade/contratos/esquemas";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  FERIADOS_NACIONAIS,
  FONTE_BCB,
  FONTES_INDICES,
  REGRAS_TRIBUTARIAS_VIGENTES,
  premissasDosIndices,
  TIPOS_TITULO,
  taxaAnualDeDiaria,
  type ComparacaoPreIpca,
  type ComparacaoSelicCdbPoupanca,
  type Equivalencia,
  type Indices,
  type Posicao,
  type Projecao,
  type ResultadoAlternativa,
} from "@zentrade/financas";

/** Contas (financas) → formato do contrato, para a demonstração falar a mesma língua da API. */
export const dinheiro = (v: Valor): string => paraTexto(v.toDecimalPlaces(2));
export const percentual = (v: Valor): string => paraTexto(v.toDecimalPlaces(6));
const fracaoEmPct = (v: Valor): string => paraTexto(v.times(100).toDecimalPlaces(4));
const opcional = (v: Valor | null): string | null => (v === null ? null : percentual(v));

export function posicaoDto(p: Posicao): PosicaoTitulo {
  if (!p.disponivel) return { disponivel: false, aplicado: dinheiro(p.aplicado), motivo: p.motivo };
  return {
    disponivel: true,
    fonte: p.fonte,
    ate: p.ate,
    vencido: p.vencido,
    aplicado: dinheiro(p.aplicado),
    bruto: dinheiro(p.bruto),
    iof: dinheiro(p.iof),
    ir: dinheiro(p.ir),
    liquido: dinheiro(p.liquido),
    rendimentoBruto: dinheiro(p.rendimentoBruto),
    rendimentoLiquido: dinheiro(p.rendimentoLiquido),
    rentabilidadeBrutaPct: percentual(p.rentabilidadeBrutaPct),
    rentabilidadeLiquidaPct: percentual(p.rentabilidadeLiquidaPct),
    aliquotaIrPct: fracaoEmPct(p.aliquotaIr),
    aliquotaIofPct: fracaoEmPct(p.aliquotaIof),
    isentoIr: p.isentoIr,
    diasCorridos: p.diasCorridos,
    diasUteis: p.diasUteis,
    cdiPeriodoPct: opcional(p.cdiPeriodoPct),
    percentualDoCdi: opcional(p.percentualDoCdi),
    poupancaPeriodoPct: opcional(p.poupancaPeriodoPct),
    avisos: [...p.avisos],
  };
}

export function projecaoDto(p: Projecao): ProjecaoTitulo {
  if (!p.disponivel) return p;
  return {
    disponivel: true,
    fim: p.fim,
    premissas: [...p.premissas],
    pontos: p.pontos.map((x) => ({
      dia: x.dia,
      bruto: dinheiro(x.bruto),
      iof: dinheiro(x.iof),
      ir: dinheiro(x.ir),
      liquido: dinheiro(x.liquido),
      aliquotaIrPct: fracaoEmPct(x.aliquotaIr),
    })),
  };
}

export function regrasDto(): RegrasTributariasDTO {
  const r = REGRAS_TRIBUTARIAS_VIGENTES;
  return {
    verificadoEm: r.verificadoEm,
    ir: {
      fonte: r.ir.fonte,
      vigenteDesde: r.ir.vigenteDesde,
      faixas: r.ir.faixas.map((f) => ({ ateDias: f.ateDias, aliquotaPct: fracaoEmPct(f.aliquota) })),
    },
    iof: { fonte: r.iof.fonte, percentuais: [...r.iof.percentuais] },
    isencoes: TIPOS_TITULO.map((tipo) => ({ tipo, ...r.isencoes[tipo] })),
    notas: [...r.notas],
    feriados: { fonte: FERIADOS_NACIONAIS.fonte, verificadoEm: FERIADOS_NACIONAIS.verificadoEm },
  };
}

function ultimo<K extends string>(m: ReadonlyMap<K, Valor>): [K, Valor] | null {
  let u: [K, Valor] | null = null;
  for (const par of m) if (!u || par[0] > u[0]) u = par;
  return u;
}

export function indicadoresDto(i: Indices, verificadoEm: number): Indicadores {
  const linha = (serie: keyof typeof FONTES_INDICES, par: [string, Valor] | null, anual: Valor | null) => ({
    serie,
    codigoSgs: FONTES_INDICES[serie].serie,
    nome: FONTES_INDICES[serie].nome,
    unidade: FONTES_INDICES[serie].unidade,
    ultimoDia: par ? (par[0].length === 7 ? `${par[0]}-01` : par[0]) : null,
    ultimoValor: par ? paraTexto(par[1]) : null,
    anualizado: anual ? paraTexto(anual.toDecimalPlaces(4)) : null,
    verificadoEm,
    erro: null,
  });
  const cdi = ultimo(i.cdi);
  const selic = ultimo(i.selic);
  return {
    fonte: `${FONTE_BCB} — valores de demonstração, não são os publicados`,
    series: [
      linha("CDI", cdi, cdi ? taxaAnualDeDiaria(cdi[1]) : null),
      linha("SELIC", selic, selic ? taxaAnualDeDiaria(selic[1]) : null),
      linha("SELIC_META", cdi ? [cdi[0], dec("13.75")] : null, cdi ? dec("13.75") : null),
      linha("IPCA", ultimo(i.ipca), premissasDosIndices(i, "9999-12-31").ipcaAnual?.valor ?? null),
      linha("POUPANCA", ultimo(i.poupanca), null),
      linha("TR", cdi ? [cdi[0], dec("0.16")] : null, null),
    ],
  };
}

const alternativa = (a: ResultadoAlternativa) => ({
  bruto: dinheiro(a.bruto),
  iof: dinheiro(a.iof),
  ir: dinheiro(a.ir),
  custodia: dinheiro(a.custodia),
  liquido: dinheiro(a.liquido),
  aliquotaIrPct: fracaoEmPct(a.aliquotaIr),
  rentabilidadeLiquidaPct: percentual(a.rentabilidadeLiquidaPct),
});

export const isentoDto = (e: Equivalencia): ResultadoIsento => ({
  aliquotaIrPct: fracaoEmPct(e.aliquotaIr),
  equivalente: percentual(e.equivalente),
  regraDeBolso: percentual(e.regraDeBolso),
  curva: e.curva.map((c) => ({
    prazoDias: c.prazoDias,
    equivalente: percentual(c.equivalente),
    aliquotaIrPct: fracaoEmPct(c.aliquotaIr),
  })),
  premissas: [...e.premissas],
});

export const selicDto = (c: ComparacaoSelicCdbPoupanca): ResultadoSelicCdbPoupanca => ({
  tesouroSelic: alternativa(c.tesouroSelic),
  cdb: alternativa(c.cdb),
  poupanca: alternativa(c.poupanca),
  serie: c.serie.map((s) => ({
    dia: s.dia,
    tesouroSelic: dinheiro(s.tesouroSelic),
    cdb: dinheiro(s.cdb),
    poupanca: dinheiro(s.poupanca),
  })),
  premissas: [...c.premissas],
});

export const preIpcaDto = (c: ComparacaoPreIpca): ResultadoPreIpca => ({
  inflacaoEquilibrio: percentual(c.inflacaoEquilibrio),
  prefixado: alternativa(c.prefixado),
  ipcaMais: alternativa(c.ipcaMais),
  curva: c.curva.map((p) => ({
    ipca: percentual(p.ipca),
    prefixado: dinheiro(p.prefixado),
    ipcaMais: dinheiro(p.ipcaMais),
  })),
  premissas: [...c.premissas],
});
