/** Fuso padrão da instância (o usuário está em Brasília). */
export const FUSO_PADRAO = "America/Sao_Paulo";

/** O fuso existe para o Intl? (validação da configuração). */
export function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/**
 * "sábado, 17/10/2026 22:52 (America/Sao_Paulo; UTC 2026-10-18T01:52Z)": a hora de
 * quem opera, com o nome do fuso, e o UTC para não haver dúvida.
 */
export function agoraComFuso(agora: Date, fuso: string): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  const utc = `${agora.toISOString().slice(0, 16)}Z`;
  return `${partes.weekday}, ${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute} (${fuso}; UTC ${utc})`;
}
