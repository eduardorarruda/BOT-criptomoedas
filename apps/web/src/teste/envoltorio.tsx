import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ProvedorFonte } from "../api/contexto";
import type { Fonte } from "../api/fonte";
import { ProvedorReautenticacao } from "../sessao/Reautenticacao";

/** Envoltório para testar ganchos (renderHook) com a fonte e o cliente de consultas. */
export function criarEnvoltorio(fonte: Fonte) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Envoltorio({ children }: { children: ReactNode }) {
    return (
      <ProvedorFonte fonte={fonte}>
        <QueryClientProvider client={queryClient}>
          <ProvedorReautenticacao>{children}</ProvedorReautenticacao>
        </QueryClientProvider>
      </ProvedorFonte>
    );
  }
  return { Envoltorio, queryClient };
}
