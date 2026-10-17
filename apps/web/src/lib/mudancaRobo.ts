import type { ModoRobo, RoboDTO } from "@zentrade/contratos/esquemas";
import type { MudancaRobo } from "../api/fonte";

/**
 * Regras das mudanças de robô na tela. Uma regra só: nem a tela otimista nem o
 * Desfazer deixam um robô mais ativo do que um clique pensado deixaria.
 *
 * - Otimista só quando o robô fica mais calmo: pausar, ou baixar o modo
 *   (automático → sugerir → observar). Retomar ou subir o modo esperam a confirmação:
 *   mostrar o robô mais ativo antes de o servidor aceitar seria mentir sobre dinheiro
 *   (na rede real, sugerir já manda ordem de verdade depois da aprovação).
 * - Desfazer só volta para algo mais calmo, ou retoma um robô que não opera sozinho.
 *   Um robô no automático só volta pelo botão Retomar (ou pelo diálogo do modo).
 */
const ATIVIDADE: Readonly<Record<ModoRobo, number>> = { observar: 0, sugerir: 1, auto: 2 };

const definidas = (m: MudancaRobo): (keyof MudancaRobo)[] =>
  (Object.keys(m) as (keyof MudancaRobo)[]).filter((k) => m[k] !== undefined);

const soPausaOuModo = (m: MudancaRobo): boolean => {
  const chaves = definidas(m);
  return chaves.length > 0 && chaves.every((k) => k === "pausado" || k === "modo");
};

export function mudancaSegura(antes: RoboDTO, m: MudancaRobo): boolean {
  if (!soPausaOuModo(m) || m.pausado === false) return false;
  return m.modo === undefined || ATIVIDADE[m.modo] < ATIVIDADE[antes.modo];
}

export function desfazerDe(antes: RoboDTO, m: MudancaRobo): MudancaRobo | null {
  if (!soPausaOuModo(m)) return null;
  // Voltar ao modo de antes só se ele for mais calmo do que o novo.
  if (m.modo !== undefined && ATIVIDADE[antes.modo] >= ATIVIDADE[m.modo]) return null;
  // Desfazer uma pausa retoma o robô: nunca um que opera sozinho.
  if (m.pausado === true && antes.modo === "auto") return null;
  return {
    ...(m.pausado !== undefined ? { pausado: antes.pausado } : {}),
    ...(m.modo !== undefined ? { modo: antes.modo } : {}),
  };
}
