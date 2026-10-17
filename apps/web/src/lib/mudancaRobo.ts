import type { RoboDTO } from "@zentrade/contratos/esquemas";
import type { MudancaRobo } from "../api/fonte";

/**
 * Regras das mudanças de robô na tela.
 *
 * - Otimista só no sentido seguro: pausar, ou ir para observar/sugerir, aparece na hora
 *   (e volta se a API recusar). Retomar ou ligar o automático esperam a confirmação:
 *   mostrar "trabalhando" antes de o servidor aceitar seria mentir sobre dinheiro.
 * - Desfazer só o que se desfaz de verdade (pausa e modo), e nunca religa o automático:
 *   esse passa sempre pelo diálogo de confirmação.
 */
const definidas = (m: MudancaRobo): (keyof MudancaRobo)[] =>
  (Object.keys(m) as (keyof MudancaRobo)[]).filter((k) => m[k] !== undefined);

export function mudancaSegura(m: MudancaRobo): boolean {
  const chaves = definidas(m);
  if (chaves.length === 0 || chaves.some((k) => k !== "pausado" && k !== "modo")) return false;
  if (m.pausado === false) return false;
  return m.modo !== "auto";
}

export function desfazerDe(antes: RoboDTO, m: MudancaRobo): MudancaRobo | null {
  const chaves = definidas(m);
  if (chaves.length === 0 || chaves.some((k) => k !== "pausado" && k !== "modo")) return null;
  if (m.modo !== undefined && antes.modo === "auto") return null;
  return {
    ...(m.pausado !== undefined ? { pausado: antes.pausado } : {}),
    ...(m.modo !== undefined ? { modo: antes.modo } : {}),
  };
}
