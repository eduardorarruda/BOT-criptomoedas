/**
 * Calendário de dias úteis do mercado brasileiro (base 252). Datas são dias de
 * calendário "AAAA-MM-DD", sem hora nem fuso: o rendimento de renda fixa conta dias,
 * não instantes. As contas usam o número de dias desde 1970-01-01 em UTC, que não
 * sofre com horário de verão nem com o fuso de quem roda o código.
 */
export type Dia = string;
/** Mês "AAAA-MM". */
export type Mes = string;

export class ErroCalendario extends Error {
  override name = "ErroCalendario";
}

const MS_DIA = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validarDia(texto: string): Dia {
  const m = FORMATO.exec(texto);
  if (!m) throw new ErroCalendario(`data inválida: "${texto}" (use AAAA-MM-DD)`);
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new ErroCalendario(`data inexistente: "${texto}"`);
  }
  return texto;
}

export function diaParaNumero(d: Dia): number {
  return Date.parse(`${validarDia(d)}T00:00:00Z`) / MS_DIA;
}

export function numeroParaDia(n: number): Dia {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}

export const somarDias = (d: Dia, n: number): Dia => numeroParaDia(diaParaNumero(d) + n);

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export const diasCorridos = (de: Dia, ate: Dia): number => diaParaNumero(ate) - diaParaNumero(de);

/** 0 = domingo … 6 = sábado. */
export const diaDaSemana = (d: Dia): number => (((diaParaNumero(d) + 4) % 7) + 7) % 7;

export const mesDe = (d: Dia): Mes => validarDia(d).slice(0, 7);

const doisDigitos = (n: number): string => String(n).padStart(2, "0");
const montarDia = (ano: number, mes: number, dia: number): Dia =>
  `${String(ano).padStart(4, "0")}-${doisDigitos(mes)}-${doisDigitos(dia)}`;

/** Mesmo dia `n` meses depois; se o mês não tem o dia (31/01 + 1), fica no último dia. */
export function somarMeses(d: Dia, n: number): Dia {
  const [ano, mes, dia] = validarDia(d).split("-").map(Number) as [number, number, number];
  const total = ano * 12 + (mes - 1) + n;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return montarDia(novoAno, novoMes, Math.min(dia, ultimo));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Dia {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return montarDia(ano, mes, dia);
}

export interface RegraFeriado {
  readonly nome: string;
  /** Data fixa (mês e dia) ou deslocamento em dias a partir do domingo de Páscoa. */
  readonly quando: { readonly mes: number; readonly dia: number } | { readonly pascoa: number };
  /** Primeiro ano em que vale (inclusive). */
  readonly desde?: number;
  /** Norma ou fonte que faz do dia um feriado (ou dia sem expediente bancário). */
  readonly base: string;
}

/**
 * Feriados nacionais que fecham o mercado financeiro: o calendário da ANBIMA, usado
 * por todo o mercado para contar dias úteis na base 252. Conferido contra a lista
 * publicada pela ANBIMA para 2026 e contra as publicações do CDI (SGS 12) do Banco
 * Central em setembro de 2026 (sem 07/09).
 */
export const FERIADOS_NACIONAIS = {
  fonte: "Calendário de feriados nacionais da ANBIMA (anbima.com.br/feriados)",
  verificadoEm: "2026-10-11",
  regras: [
    { nome: "Confraternização Universal", quando: { mes: 1, dia: 1 }, base: "Lei 662/1949" },
    { nome: "Carnaval", quando: { pascoa: -48 }, base: "Calendário ANBIMA (sem expediente bancário)" },
    { nome: "Carnaval", quando: { pascoa: -47 }, base: "Calendário ANBIMA (sem expediente bancário)" },
    { nome: "Paixão de Cristo", quando: { pascoa: -2 }, base: "Calendário ANBIMA" },
    { nome: "Tiradentes", quando: { mes: 4, dia: 21 }, base: "Lei 662/1949" },
    { nome: "Dia do Trabalho", quando: { mes: 5, dia: 1 }, base: "Lei 662/1949" },
    { nome: "Corpus Christi", quando: { pascoa: 60 }, base: "Calendário ANBIMA" },
    { nome: "Independência do Brasil", quando: { mes: 9, dia: 7 }, base: "Lei 662/1949" },
    { nome: "Nossa Senhora Aparecida", quando: { mes: 10, dia: 12 }, base: "Lei 6.802/1980" },
    { nome: "Finados", quando: { mes: 11, dia: 2 }, base: "Lei 10.607/2002" },
    { nome: "Proclamação da República", quando: { mes: 11, dia: 15 }, base: "Lei 662/1949" },
    {
      nome: "Dia Nacional de Zumbi e da Consciência Negra",
      quando: { mes: 11, dia: 20 },
      desde: 2024,
      base: "Lei 14.759/2023",
    },
    { nome: "Natal", quando: { mes: 12, dia: 25 }, base: "Lei 662/1949" },
  ] satisfies readonly RegraFeriado[],
} as const;

export interface Feriado {
  readonly dia: Dia;
  readonly nome: string;
}

const ANO_MINIMO = 1950;
const ANO_MAXIMO = 2299;
const cacheFeriados = new Map<number, ReadonlySet<Dia>>();

export function feriadosNacionais(ano: number): Feriado[] {
  if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > ANO_MAXIMO) {
    throw new ErroCalendario(`calendário de feriados disponível só de ${ANO_MINIMO} a ${ANO_MAXIMO}`);
  }
  const domingoPascoa = pascoa(ano);
  const regras: readonly RegraFeriado[] = FERIADOS_NACIONAIS.regras;
  return regras
    .filter((r) => r.desde === undefined || ano >= r.desde)
    .map((r) => ({
      nome: r.nome,
      dia:
        "pascoa" in r.quando
          ? somarDias(domingoPascoa, r.quando.pascoa)
          : montarDia(ano, r.quando.mes, r.quando.dia),
    }))
    .sort((x, y) => (x.dia < y.dia ? -1 : 1));
}

function feriadosDoAno(ano: number): ReadonlySet<Dia> {
  let conjunto = cacheFeriados.get(ano);
  if (!conjunto) {
    conjunto = new Set(feriadosNacionais(ano).map((f) => f.dia));
    cacheFeriados.set(ano, conjunto);
  }
  return conjunto;
}

export function ehDiaUtil(d: Dia): boolean {
  const semana = diaDaSemana(d);
  if (semana === 0 || semana === 6) return false;
  return !feriadosDoAno(Number(d.slice(0, 4))).has(d);
}

/** Dias úteis em [de, ate): o dia da aplicação rende, o do resgate não. Zero se `ate` não passa de `de`. */
export function diasUteis(de: Dia, ate: Dia): number {
  const inicio = diaParaNumero(de);
  const fim = diaParaNumero(ate);
  let total = 0;
  for (let n = inicio; n < fim; n++) if (ehDiaUtil(numeroParaDia(n))) total++;
  return total;
}

/** Lista os dias úteis em [de, ate). */
export function listarDiasUteis(de: Dia, ate: Dia): Dia[] {
  const dias: Dia[] = [];
  for (let n = diaParaNumero(de); n < diaParaNumero(ate); n++) {
    const d = numeroParaDia(n);
    if (ehDiaUtil(d)) dias.push(d);
  }
  return dias;
}

export function proximoDiaUtil(d: Dia): Dia {
  let atual = validarDia(d);
  while (!ehDiaUtil(atual)) atual = somarDias(atual, 1);
  return atual;
}

/** O dia útil `n` dias úteis depois de `d` (n ≥ 0). */
export function somarDiasUteis(d: Dia, n: number): Dia {
  if (!Number.isInteger(n) || n < 0)
    throw new ErroCalendario("só dá para somar um número inteiro e positivo de dias úteis");
  let atual = validarDia(d);
  for (let faltam = n; faltam > 0;) {
    atual = somarDias(atual, 1);
    if (ehDiaUtil(atual)) faltam--;
  }
  return atual;
}
