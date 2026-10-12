import { z } from "zod";
import { Id, Instante } from "./comum.js";

/**
 * Alertas operacionais: o motor, o agente e a API os emitem; a API deduplica, grava o
 * aviso na tela da pessoa e repassa ao n8n (Telegram). Ver docs/alertas.md.
 */
export const TipoAlerta = z.enum([
  "stop_atingido",
  "perda_diaria_robo",
  "perda_diaria_conta",
  "pausa_sequencia_stops",
  "pausa_queda",
  "ordem_rejeitada",
  "ordem_incerta",
  "robo_nao_ligou",
  "websocket_fora",
  "divergencia_saldo",
  "orcamento_ia_80",
  "orcamento_ia_100",
]);
export type TipoAlerta = z.infer<typeof TipoAlerta>;

export const GravidadeAlerta = z.enum(["info", "atencao", "critico"]);
export type GravidadeAlerta = z.infer<typeof GravidadeAlerta>;

/**
 * Alerta emitido por um serviço. `chave` identifica o fato (ex.: o robô que não liga):
 * o mesmo fato dentro da janela de deduplicação vira um aviso só. A dona vem de
 * `usuarioId` ou, sem ele, do robô.
 */
export const AlertaEmitidoEsquema = z.object({
  tipo: TipoAlerta,
  gravidade: GravidadeAlerta,
  titulo: z.string().min(1).max(120),
  mensagem: z.string().min(1).max(1000),
  chave: z.string().min(1).max(200),
  usuarioId: Id.optional(),
  roboId: Id.optional(),
  em: Instante,
});
export type AlertaEmitido = z.infer<typeof AlertaEmitidoEsquema>;

/** `GET /avisos`: os alertas que chegaram para a pessoa, na tela. */
export const AvisoEsquema = z.object({
  id: Id,
  tipo: TipoAlerta,
  gravidade: GravidadeAlerta,
  titulo: z.string(),
  mensagem: z.string(),
  roboId: Id.nullable(),
  criadoEm: Instante,
  lidoEm: Instante.nullable(),
  /** Também foi para o Telegram (n8n). Falso quando o limite por pessoa segurou. */
  enviado: z.boolean(),
});
export type AvisoDTO = z.infer<typeof AvisoEsquema>;
