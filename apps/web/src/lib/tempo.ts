import { fusoDaInstancia } from "./fuso";

/** Datas sempre no fuso da instância (padrão: São Paulo) e em pt-BR; horários chegam em ms UTC. */
interface Formatos {
  readonly dataHora: Intl.DateTimeFormat;
  readonly hora: Intl.DateTimeFormat;
  readonly dataLonga: Intl.DateTimeFormat;
}

const porFuso = new Map<string, Formatos>();

function formatos(): Formatos {
  const timeZone = fusoDaInstancia();
  const salvo = porFuso.get(timeZone);
  if (salvo) return salvo;
  const novos: Formatos = {
    dataHora: new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    hora: new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    dataLonga: new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  };
  porFuso.set(timeZone, novos);
  return novos;
}

export const formatarDataHora = (ms: number): string => formatos().dataHora.format(ms).replace(", ", " ");
export const formatarHora = (ms: number): string => formatos().hora.format(ms);
export const formatarData = (ms: number): string => formatos().dataLonga.format(ms);

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export function formatarRelativo(ms: number, agora: number = Date.now()): string {
  const passado = agora - ms;
  if (passado < MINUTO) return "agora há pouco";
  if (passado < HORA) return `há ${Math.floor(passado / MINUTO)} min`;
  if (passado < DIA) return `há ${Math.floor(passado / HORA)} h`;
  const dias = Math.floor(passado / DIA);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function formatarDuracao(ms: number): string {
  if (ms < MINUTO) return `${Math.round(ms / 1000)} s`;
  if (ms < HORA) return `${Math.round(ms / MINUTO)} min`;
  const horas = Math.floor(ms / HORA);
  const minutos = Math.round((ms % HORA) / MINUTO);
  return minutos ? `${horas} h ${minutos} min` : `${horas} h`;
}
