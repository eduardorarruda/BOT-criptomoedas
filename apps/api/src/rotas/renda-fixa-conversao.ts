import type { LinhaTitulo } from "@zentrade/banco";
import type {
  SimularIsento,
  SimularPreIpca,
  SimularSelicCdbPoupanca,
  PosicaoTitulo,
  ProjecaoTitulo,
  RegrasTributariasDTO,
  ResultadoIsento,
  ResultadoPreIpca,
  ResultadoSelicCdbPoupanca,
  TituloRendaFixa,
} from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  compararSelicCdbPoupanca,
  equivalenciaIsento,
  preVersusIpca,
  FERIADOS_NACIONAIS,
  REGRAS_TRIBUTARIAS_VIGENTES,
  TIPOS_TITULO,
  type ComparacaoPreIpca,
  type ComparacaoSelicCdbPoupanca,
  type Equivalencia,
  type Posicao,
  type Projecao,
  type ResultadoAlternativa,
  type Titulo,
} from "@zentrade/financas";

/** Banco ↔ contas ↔ contrato. Dinheiro sai com 2 casas; percentuais, com 6. */

const dinheiro = (v: Valor): string => paraTexto(v.toDecimalPlaces(2));
const percentual = (v: Valor): string => paraTexto(v.toDecimalPlaces(6));
const fracaoEmPct = (v: Valor): string => paraTexto(v.times(100).toDecimalPlaces(4));
const opcional = (v: Valor | null, f: (x: Valor) => string): string | null => (v === null ? null : f(v));
const decOpcional = (v: string | null): Valor | null => (v === null ? null : dec(v));

export function paraTitulo(l: LinhaTitulo): Titulo {
  return {
    id: l.id,
    tipo: l.tipo,
    nome: l.nome,
    emissor: l.emissor,
    indexador: l.indexador,
    percentualIndexador: decOpcional(l.percentualIndexador),
    taxaAnual: decOpcional(l.taxaAnual),
    dataAplicacao: l.dataAplicacao,
    vencimento: l.vencimento,
    valorAplicado: dec(l.valorAplicado),
    liquidez: l.liquidez,
    carenciaAte: l.carenciaAte,
    informado: l.informado
      ? {
          em: l.informado.em,
          bruto: dec(l.informado.bruto),
          liquido: decOpcional(l.informado.liquido),
          ir: decOpcional(l.informado.ir),
          iof: decOpcional(l.informado.iof),
          fonte: "Pluggy (informado pela instituição)",
        }
      : null,
    grupo: l.grupo,
  };
}

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
    cdiPeriodoPct: opcional(p.cdiPeriodoPct, percentual),
    percentualDoCdi: opcional(p.percentualDoCdi, percentual),
    poupancaPeriodoPct: opcional(p.poupancaPeriodoPct, percentual),
    avisos: [...p.avisos],
  };
}

export function tituloDto(l: LinhaTitulo, p: Posicao): TituloRendaFixa {
  return {
    id: l.id,
    origem: l.origem,
    itemId: l.itemId,
    grupo: l.grupo,
    tipo: l.tipo,
    nome: l.nome,
    emissor: l.emissor,
    indexador: l.indexador,
    percentualIndexador: l.percentualIndexador,
    taxaAnual: l.taxaAnual,
    dataAplicacao: l.dataAplicacao,
    vencimento: l.vencimento,
    valorAplicado: l.valorAplicado,
    liquidez: l.liquidez,
    carenciaAte: l.carenciaAte,
    informado: l.informado ? { ...l.informado, fonte: "Pluggy (informado pela instituição)" } : null,
    atualizadoEm: l.atualizadoEm,
    posicao: posicaoDto(p),
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

export const selicCdbPoupancaDto = (c: ComparacaoSelicCdbPoupanca): ResultadoSelicCdbPoupanca => ({
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

/** Corpo validado do contrato → contas → resposta. `inicio` é o "hoje" em São Paulo. */
export const simularIsento = (b: SimularIsento, inicio: string): ResultadoIsento =>
  isentoDto(
    equivalenciaIsento({
      direcao: b.direcao,
      percentualCdi: dec(b.percentualCdi),
      prazoDias: b.prazoDias,
      cdiAnual: dec(b.cdiAnual),
      inicio,
    }),
  );

export const simularSelicCdbPoupanca = (
  b: SimularSelicCdbPoupanca,
  inicio: string,
): ResultadoSelicCdbPoupanca =>
  selicCdbPoupancaDto(
    compararSelicCdbPoupanca({
      valor: dec(b.valor),
      inicio,
      prazoDias: b.prazoDias,
      selicAnual: dec(b.selicAnual),
      cdiAnual: dec(b.cdiAnual),
      percentualCdb: dec(b.percentualCdb),
      metaSelicAnual: dec(b.metaSelicAnual),
      trMensal: dec(b.trMensal),
    }),
  );

export const simularPreIpca = (b: SimularPreIpca, inicio: string): ResultadoPreIpca =>
  preIpcaDto(
    preVersusIpca({
      valor: dec(b.valor),
      inicio,
      prazoDias: b.prazoDias,
      taxaPre: dec(b.taxaPre),
      taxaReal: dec(b.taxaReal),
      ipcaEsperado: dec(b.ipcaEsperado),
    }),
  );
