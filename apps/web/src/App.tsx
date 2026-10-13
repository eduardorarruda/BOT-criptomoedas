import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { LazyMotion, MotionConfig } from "motion/react";
import { useState } from "react";
import { ProvedorFonte } from "./api/contexto";
import { ehErroApi } from "./api/erros";
import type { Fonte } from "./api/fonte";
import { ProvedorAvisos } from "./componentes/Avisos";
import { chaves } from "./ganchos/chaves";
import { Abertura } from "./layout/Abertura";
import { criarRoteador } from "./rotas";
import { ProvedorReautenticacao } from "./sessao/Reautenticacao";

/** Os recursos de animação do Motion chegam depois do primeiro desenho (pacote à parte). */
const recursosMovimento = () => import("./lib/recursosMovimento").then((m) => m.default);

/** Sessão expirada em qualquer pedido: esquece o usuário e volta para o login. */
function criarCliente(aoExpirar: () => void): QueryClient {
  const tratar = (e: unknown): void => {
    if (ehErroApi(e) && e.codigo === "nao_autenticado") aoExpirar();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: tratar }),
    mutationCache: new MutationCache({ onError: tratar }),
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: (falhas, e) =>
          !(ehErroApi(e) && ["nao_autenticado", "nao_encontrado", "resposta_invalida"].includes(e.codigo)) &&
          falhas < 2,
      },
    },
  });
}

export function App({ fonte }: { readonly fonte: Fonte }) {
  const [{ queryClient, roteador }] = useState(() => {
    const ref: { roteador?: ReturnType<typeof criarRoteador> } = {};
    const qc = criarCliente(() => {
      qc.setQueryData(chaves.sessao, null);
      void ref.roteador?.navigate({ to: "/entrar" });
    });
    ref.roteador = criarRoteador({ queryClient: qc, fonte });
    return { queryClient: qc, roteador: ref.roteador };
  });

  return (
    <ProvedorFonte fonte={fonte}>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={recursosMovimento} strict>
          <MotionConfig reducedMotion="user">
            <ProvedorAvisos>
              <ProvedorReautenticacao>
                <Abertura />
                <RouterProvider router={roteador} />
              </ProvedorReautenticacao>
            </ProvedorAvisos>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </ProvedorFonte>
  );
}
