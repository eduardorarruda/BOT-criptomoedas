import { horaNoFuso, inicioDoDiaDaData, inicioDoProximoDiaNoFuso } from "@zentrade/dominio";
import { fusoDaInstancia } from "../../lib/fuso";

/**
 * Período dos filtros: atalhos (7, 30, 90 dias, no ano, 12 meses, tudo) e um
 * intervalo escolhido à mão. Datas de calendário no fuso da instância (o mesmo "dia"
 * do motor e da API), não no do navegador.
 */
export const PERIODOS = ["7d", "30d", "90d", "ano", "12m", "tudo", "personalizado"] as const;
export type Periodo = (typeof PERIODOS)[number];

export interface EscolhaPeriodo {
  readonly periodo?: Periodo | undefined;
  readonly de?: string | undefined;
  readonly ate?: string | undefined;
}

export interface Intervalo {
  readonly inicio: number;
  readonly fim: number;
}

export const ROTULO_PERIODO: Readonly<Record<Periodo, string>> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  ano: "No ano",
  "12m": "12 meses",
  tudo: "Tudo",
  personalizado: "Escolher datas",
};

const DIA = 86_400_000;
const DIAS: Partial<Record<Periodo, number>> = { "7d": 7, "30d": 30, "90d": 90 };

/** "2026-10-01" → meia-noite daquele dia no fuso da instância. */
const inicioDoDia = (dia: string): number => inicioDoDiaDaData(dia, fusoDaInstancia());

/** O último milissegundo do dia (o dia pode ter 23 ou 25 horas no horário de verão). */
const fimDoDia = (dia: string): number => inicioDoProximoDiaNoFuso(inicioDoDia(dia), fusoDaInstancia()) - 1;

function personalizado(de: string | undefined, ate: string | undefined): Intervalo | null {
  if (!de && !ate) return null;
  const [a, b] = de && ate && de > ate ? [ate, de] : [de, ate];
  return {
    inicio: a ? inicioDoDia(a) : Number.NEGATIVE_INFINITY,
    fim: b ? fimDoDia(b) : Number.POSITIVE_INFINITY,
  };
}

/** O intervalo em ms; null = sem corte. */
export function intervaloDoPeriodo(e: EscolhaPeriodo, agora: number = Date.now()): Intervalo | null {
  const p = e.periodo;
  if (!p || p === "tudo") return null;
  if (p === "personalizado") return personalizado(e.de, e.ate);
  const dias = DIAS[p];
  if (dias) return { inicio: agora - dias * DIA, fim: agora };
  if (p === "ano") {
    const ano = horaNoFuso(agora, fusoDaInstancia()).ano;
    return { inicio: inicioDoDia(`${String(ano).padStart(4, "0")}-01-01`), fim: agora };
  }
  const umAnoAtras = new Date(agora);
  umAnoAtras.setUTCFullYear(umAnoAtras.getUTCFullYear() - 1);
  return { inicio: umAnoAtras.getTime(), fim: agora };
}

export function dentroDoPeriodo(instante: number, intervalo: Intervalo | null): boolean {
  return !intervalo || (instante >= intervalo.inicio && instante <= intervalo.fim);
}

const dataBr = (dia: string): string => dia.split("-").reverse().join("/");

export function descreverPeriodo(e: EscolhaPeriodo): string {
  const p = e.periodo;
  if (!p || p === "tudo") return "todo o histórico";
  if (p === "personalizado") {
    if (e.de && e.ate) return `de ${dataBr(e.de)} a ${dataBr(e.ate)}`;
    if (e.de) return `desde ${dataBr(e.de)}`;
    if (e.ate) return `até ${dataBr(e.ate)}`;
    return "todo o histórico";
  }
  if (p === "ano") return "neste ano";
  if (p === "12m") return "últimos 12 meses";
  return `últimos ${DIAS[p]} dias`;
}
