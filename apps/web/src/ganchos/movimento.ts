import { useReducedMotion } from "motion/react";

/** true quando a pessoa pediu menos movimento no sistema. Toda animação em JS consulta isto. */
export function useMenosMovimento(): boolean {
  return useReducedMotion() ?? false;
}
