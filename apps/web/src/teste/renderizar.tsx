import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactElement } from "react";
import { ProvedorFonte } from "../api/contexto";
import type { Fonte } from "../api/fonte";
import { ProvedorAvisos } from "../componentes/Avisos";
import { ProvedorReautenticacao } from "../sessao/Reautenticacao";

/** Renderiza com os mesmos provedores da aplicação, sobre uma fonte de dados de teste. */
export function renderizar(ui: ReactElement, fonte: Fonte) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const resultado = render(
    <ProvedorFonte fonte={fonte}>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={domAnimation}>
          <MotionConfig reducedMotion="always">
            <ProvedorAvisos>
              <ProvedorReautenticacao>{ui}</ProvedorReautenticacao>
            </ProvedorAvisos>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </ProvedorFonte>,
  );
  return { ...resultado, queryClient };
}
