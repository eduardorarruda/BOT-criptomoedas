export type FuncaoMotor = "tudo" | "robos" | "backtests";

/**
 * O que este processo do motor faz. Backtest é CPU por minutos: no mesmo processo dos
 * robôs, ele segura o laço de eventos e atrasa velas, stops e decisões ao vivo. Em
 * produção, rode um processo com "robos" e outro com "backtests" (a mesma imagem).
 */
export function papeisDoMotor(funcao: FuncaoMotor): { robos: boolean; backtests: boolean } {
  return { robos: funcao !== "backtests", backtests: funcao !== "robos" };
}
