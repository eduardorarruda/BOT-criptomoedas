import { createContext, useContext, type ReactNode } from "react";
import type { Fonte } from "./fonte";

const ContextoFonte = createContext<Fonte | null>(null);

export function ProvedorFonte({ fonte, children }: { readonly fonte: Fonte; readonly children: ReactNode }) {
  return <ContextoFonte.Provider value={fonte}>{children}</ContextoFonte.Provider>;
}

export function useFonte(): Fonte {
  const fonte = useContext(ContextoFonte);
  if (!fonte) throw new Error("useFonte precisa estar dentro de <ProvedorFonte>");
  return fonte;
}
