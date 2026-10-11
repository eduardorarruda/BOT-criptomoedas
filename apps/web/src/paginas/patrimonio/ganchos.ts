import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { useFonte } from "../../api/contexto";
import { criarFontePatrimonio, criarFontePatrimonioDemo, type FontePatrimonio } from "./fonte";

/** Os testes trocam a fonte do patrimônio por este contexto; na aplicação ele fica vazio. */
export const ContextoFontePatrimonio = createContext<FontePatrimonio | null>(null);

export function useFontePatrimonio(): FontePatrimonio {
  const injetada = useContext(ContextoFontePatrimonio);
  const { demo } = useFonte();
  return useMemo(
    () => injetada ?? (demo ? criarFontePatrimonioDemo() : criarFontePatrimonio()),
    [injetada, demo],
  );
}

export const chavePatrimonio = ["patrimonio", "consolidado"] as const;

/** A cripto muda com o preço: o patrimônio se atualiza a cada minuto enquanto a tela está aberta. */
const ATUALIZAR_MS = 60_000;

export function usePatrimonioConsolidado() {
  const fonte = useFontePatrimonio();
  return useQuery({
    queryKey: chavePatrimonio,
    queryFn: () => fonte.patrimonio(),
    refetchInterval: ATUALIZAR_MS,
  });
}
