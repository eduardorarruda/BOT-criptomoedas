import { descreverAgora } from "@zentrade/dominio";

/**
 * A linha do "agora" que vai para o modelo (assistente e, se quiser, o analista): a hora
 * local com o dia da semana, o fuso da instância e o UTC. Sem ela o modelo via só o UTC
 * e dizia "hoje (18/10)" às 22:52 de 17/10 em Brasília. Ex.: "Agora: sábado, 17/10/2026
 * 22:52 (America/Sao_Paulo; UTC 2026-10-18T01:52Z)".
 */
export const linhaDoAgora = (agora: Date | number, fuso: string): string =>
  `Agora: ${descreverAgora(typeof agora === "number" ? agora : agora.getTime(), fuso)}`;
