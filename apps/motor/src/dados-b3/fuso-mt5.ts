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

const MEIA_HORA = 30 * 60_000;
const diaNaive = (naiveMs: number): number => Math.floor(naiveMs / 86_400_000);

/**
 * Converte as barras para UTC. Com `fuso` configurado, usa-o (um nome IANA acompanha o
 * horário de verão do servidor — o caminho mais seguro). Sem ele, detecta o deslocamento
 * **dia a dia**: a primeira barra de cada dia do servidor é a abertura de 09:00 de
 * Brasília, arredondada para meia hora (a abertura do WIN às vezes só pega negócio às
 * 09:05); assim, a mudança de horário de verão do servidor no meio do período não
 * estraga o resto. Premissa: cada dia chega **inteiro** (quem pede as barras alinha o
 * pedido a dias completos); um dia que começa no meio seria lido como se abrisse às 09:00.
 */
export function converterBarrasMt5(naives: readonly number[], fuso: Fuso | null): number[] {
  if (fuso) return naives.map((n) => paraUtcMt5(n, fuso));
  const primeiraDoDia = new Map<number, number>();
  for (const n of naives) {
    const dia = diaNaive(n);
    const atual = primeiraDoDia.get(dia);
    if (atual === undefined || n < atual) primeiraDoDia.set(dia, n);
  }
  const deslocamentoDoDia = new Map<number, number>();
  for (const [dia, primeira] of primeiraDoDia) {
    const aberturaUtc = meiaNoiteB3(diaTexto(primeira)) + ABERTURA_BRASILIA_MIN * 60_000;
    deslocamentoDoDia.set(dia, Math.round((primeira - aberturaUtc) / MEIA_HORA) * MEIA_HORA);
  }
  return naives.map((n) => n - (deslocamentoDoDia.get(diaNaive(n)) ?? 0));
}

const diaTexto = (naiveMs: number): string => {
  const h = horaDoServidor(naiveMs);
  return `${h.ano}-${String(h.mes).padStart(2, "0")}-${String(h.dia).padStart(2, "0")}`;
};
