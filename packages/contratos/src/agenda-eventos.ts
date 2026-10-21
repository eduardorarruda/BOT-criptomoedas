import { z } from "zod";
import { Id, Instante } from "./comum.js";

/**
 * Agenda de eventos de mercado (`/api/v1/eventos-mercado`): Copom, payroll, IPCA,
 * eleição… O filtro de "dia perigoso" dos robôs e dos backtests lê esta agenda.
 * Tipos e regras de negócio ficam em @zentrade/dominio (eventos.ts).
 */
export const ImpactoEventoEsquema = z.enum(["alto", "medio"]);
export const MercadoEventoEsquema = z.enum(["win", "cripto", "todos"]);
export const OrigemEventoEsquema = z.enum(["manual", "sugerido"]);
export const ModoDiasDeEventoEsquema = z.enum(["ignorar", "bloquear", "reduzir"]);

/** "AAAA-MM-DD" de um dia que existe no calendário. */
export const DiaDoCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD")
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, "essa data não existe no calendário");

/** "HH:MM" de 00:00 a 23:59. */
const Horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário no formato HH:MM, de 00:00 a 23:59");

const Titulo = z.string().trim().min(1, "dê um título ao evento").max(120);

const CamposEvento = {
  data: DiaDoCalendario,
  mercado: MercadoEventoEsquema,
  titulo: Titulo,
  impacto: ImpactoEventoEsquema,
  de: Horario.nullish(),
  ate: Horario.nullish(),
};

function janelaCoerente(e: { de?: string | null | undefined; ate?: string | null | undefined }): boolean {
  if (!e.de && !e.ate) return true;
  return Boolean(e.de && e.ate && e.de <= e.ate);
}
const MENSAGEM_JANELA = "a janela precisa ter 'de' e 'até', com 'de' antes de 'até'";

/** `POST /eventos-mercado`. */
export const NovoEventoMercadoEsquema = z
  .strictObject(CamposEvento)
  .refine(janelaCoerente, { message: MENSAGEM_JANELA, path: ["ate"] });
export type NovoEventoMercadoDTO = z.infer<typeof NovoEventoMercadoEsquema>;

export const EventoMercadoEsquema = z.object({
  id: Id,
  ...CamposEvento,
  origem: OrigemEventoEsquema,
  criadoEm: Instante,
});
export type EventoMercadoDTO = z.infer<typeof EventoMercadoEsquema>;

const DIA_MS = 86_400_000;
const MAX_DIAS_CONSULTA = 400;

/** `GET /eventos-mercado?de=&ate=` (inclusivo nos dois lados). */
export const ConsultaAgendaEsquema = z
  .strictObject({ de: DiaDoCalendario, ate: DiaDoCalendario })
  .refine((c) => c.de <= c.ate, { message: "'de' precisa ser antes de 'ate'", path: ["ate"] })
  .refine(
    (c) => (Date.parse(`${c.ate}T00:00:00Z`) - Date.parse(`${c.de}T00:00:00Z`)) / DIA_MS <= MAX_DIAS_CONSULTA,
    { message: `o período pode ter no máximo ${MAX_DIAS_CONSULTA} dias`, path: ["ate"] },
  );

/**
 * O que o Claude devolve ao pedir os eventos da semana. É DADO não confiável: cada
 * item passa por este esquema (strict, sem campo extra) antes de virar sugestão.
 */
export const EventoSugeridoEsquema = z
  .strictObject({ ...CamposEvento, certeza: z.enum(["alta", "media", "baixa"]) })
  .refine(janelaCoerente, { message: MENSAGEM_JANELA, path: ["ate"] });
export const MAX_EVENTOS_SUGERIDOS = 40;
export const SugestaoEventosEsquema = z.strictObject({
  eventos: z.array(EventoSugeridoEsquema).max(MAX_EVENTOS_SUGERIDOS),
});
export type EventoSugeridoDTO = z.infer<typeof EventoSugeridoEsquema>;

/** `POST /eventos-mercado/sugerir`: o que entrou como sugestão, o que o Claude mandou e foi descartado e o que já existia. */
export const ResultadoSugestaoEventosEsquema = z.object({
  criados: z.array(EventoMercadoEsquema),
  descartados: z.number().int().nonnegative(),
  jaExistiam: z.number().int().nonnegative(),
});
export type ResultadoSugestaoEventos = z.infer<typeof ResultadoSugestaoEventosEsquema>;
