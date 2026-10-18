import { meiaNoiteB3 } from "./comandos.js";
import { horaLocal, instanteLocal, type Fuso, type HoraLocal } from "./fuso.js";

/**
 * O terminal MT5 devolve o horário no relógio do **servidor da corretora**, não em
 * UTC nem necessariamente em Brasília (muitas corretoras usam servidores na Europa,
 * em UTC+2 ou +3, com ou sem horário de verão). Os números que a API Python devolve,
 * lidos como época Unix, têm os dígitos da hora de parede do servidor — por isso
 * primeiro lemos esses dígitos (como se já fossem UTC) e depois aplicamos o fuso de
 * verdade do servidor, do mesmo jeito que o CSV genérico faz (`fuso.ts`).
 */
const SEM_DESLOCAMENTO: Fuso = { tipo: "fixo", minutos: 0 };

/** Os dígitos de data e hora que o MT5 mandou, sem aplicar fuso nenhum ainda. */
export const horaDoServidor = (naiveMs: number): HoraLocal => horaLocal(naiveMs, SEM_DESLOCAMENTO);

/** Converte um instante "hora do servidor" (como `horaDoServidor` leu) para UTC de verdade. */
export const paraUtcMt5 = (naiveMs: number, fusoServidor: Fuso): number =>
  instanteLocal(horaDoServidor(naiveMs), fusoServidor);

const ABERTURA_BRASILIA_MIN = 9 * 60;

/**
 * Descobre o deslocamento fixo do servidor comparando a primeira vela regular de um
 * pregão conhecido (deveria abrir às 09:00 de Brasília) com o horário que o servidor
 * mandou para ela. Serve para configurar o fuso uma vez; se o servidor seguir horário
 * de verão de algum lugar, o deslocamento muda ao longo do ano e um fuso IANA
 * (`lerFuso` de `fuso.ts`) é mais correto que este fixo.
 */
export function detectarFusoServidorMt5(primeiraVelaNaiveMs: number, diaBrasilia: string): Fuso {
  const aberturaBrasiliaUtc = meiaNoiteB3(diaBrasilia) + ABERTURA_BRASILIA_MIN * 60_000;
  const minutos = Math.round((primeiraVelaNaiveMs - aberturaBrasiliaUtc) / 60_000);
  return { tipo: "fixo", minutos };
}
