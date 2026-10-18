import { deslocamentoNoFuso, exigirFuso, FUSO_B3 } from "@zentrade/dominio";

/** O relógio da B3: horário de Brasília (sem horário de verão desde 2019; com ele antes). */
export { FUSO_B3 };

/**
 * Um fuso para ler horários: um nome IANA (`America/Sao_Paulo`, `Europe/Athens`), que
 * acompanha o horário de verão de cada época, ou um deslocamento fixo (`-03:00`, `+02:00`,
 * `UTC`), útil para servidores de MetaTrader que não seguem fuso nenhum.
 */
export type Fuso =
  { readonly tipo: "iana"; readonly nome: string } | { readonly tipo: "fixo"; readonly minutos: number };

export interface HoraLocal {
  readonly ano: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  readonly segundo?: number;
}

const MINUTO = 60_000;
const DESLOCAMENTO = /^([+-])(\d{2}):(\d{2})$/;
const MAXIMO_DESLOCAMENTO_MIN = 14 * 60;

function erroFuso(texto: string): RangeError {
  return new RangeError(
    `fuso desconhecido: "${texto}". Use um nome IANA (America/Sao_Paulo, Europe/Athens) ou um deslocamento como -03:00 ou +02:00.`,
  );
}

export function lerFuso(texto: string): Fuso {
  const t = texto.trim();
  if (t === "UTC" || t === "Z") return { tipo: "fixo", minutos: 0 };
  const d = DESLOCAMENTO.exec(t);
  if (d) {
    const minutos = (d[1] === "-" ? -1 : 1) * (Number(d[2]) * 60 + Number(d[3]));
    if (Math.abs(minutos) > MAXIMO_DESLOCAMENTO_MIN || Number(d[3]) >= 60) throw erroFuso(texto);
    return { tipo: "fixo", minutos };
  }
  if (!t.includes("/")) throw erroFuso(texto);
  try {
    return { tipo: "iana", nome: exigirFuso(t) };
  } catch {
    throw erroFuso(texto);
  }
}

/** Hora local − UTC, em minutos, no instante dado. */
function deslocamentoMin(instante: number, fuso: Fuso): number {
  if (fuso.tipo === "fixo") return fuso.minutos;
  return Math.round(deslocamentoNoFuso(instante, fuso.nome) / MINUTO);
}

/** Data e hora de parede no fuso, com o dia da semana (0 = domingo). */
export function horaLocal(instante: number, fuso: Fuso): Required<HoraLocal> & { diaSemana: number } {
  const local = new Date(instante + deslocamentoMin(instante, fuso) * MINUTO);
  return {
    ano: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
    hora: local.getUTCHours(),
    minuto: local.getUTCMinutes(),
    segundo: local.getUTCSeconds(),
    diaSemana: local.getUTCDay(),
  };
}

/**
 * O instante (ms UTC) de uma hora de parede no fuso. Na virada do horário de verão, a
 * hora que não existe anda para a frente e a repetida fica com a primeira leitura; na
 * B3 isso só acontecia à meia-noite, fora do pregão.
 */
export function instanteLocal(h: HoraLocal, fuso: Fuso): number {
  const comoUtc = Date.UTC(h.ano, h.mes - 1, h.dia, h.hora, h.minuto, h.segundo ?? 0);
  const primeiro = comoUtc - deslocamentoMin(comoUtc, fuso) * MINUTO;
  const ajustado = deslocamentoMin(primeiro, fuso);
  return comoUtc - ajustado * MINUTO;
}
