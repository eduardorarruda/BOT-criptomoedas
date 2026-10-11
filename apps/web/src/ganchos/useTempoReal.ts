import type { DecisaoDTO, OrdemDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFonte } from "../api/contexto";
import type { EventoTela } from "../api/fonte";
import { aplicarAnalise, aplicarOrdem, aplicarRobo, removerAnalise } from "./atualizarCache";
import { chaves } from "./chaves";
import { lojaAnalises, lojaBarreiras, lojaConexao, lojaPrecos } from "./lojas";
import { gravarDecisao } from "./mutacoes";

/** Tempo que o cartão "pensando" fica na tela depois que a análise vira decisão. */
const PERMANENCIA_ANALISE_MS = 4000;
const MAXIMO_BARREIRAS = 20;

export function aplicarEvento(qc: QueryClient, e: EventoTela, agendar = setTimeout): void {
  switch (e.tipo) {
    case "preco":
      lojaPrecos.definir((p) => ({
        ...p,
        [e.simbolo]: { preco: e.preco, anterior: p[e.simbolo]?.preco ?? null, em: e.em },
      }));
      return;
    case "decisao":
      gravarDecisao(qc, e.decisao satisfies DecisaoDTO);
      void qc.invalidateQueries({ queryKey: chaves.resumo });
      return;
    case "ordem":
      for (const [chave, lista] of qc.getQueriesData<OrdemDTO[]>({ queryKey: chaves.ordensTodas })) {
        if (lista) qc.setQueryData(chave, aplicarOrdem(lista, e.ordem));
      }
      void qc.invalidateQueries({ queryKey: chaves.posicoes });
      void qc.invalidateQueries({ queryKey: chaves.resumo });
      return;
    case "robo":
      qc.setQueryData(chaves.robos, (l: RoboDTO[] | undefined) => (l ? aplicarRobo(l, e.robo) : l));
      return;
    case "risco":
      lojaBarreiras.definir((b) =>
        [{ roboId: e.roboId, ...e.barreira, em: e.em }, ...b].slice(0, MAXIMO_BARREIRAS),
      );
      return;
    case "analise":
      lojaAnalises.definir((a) => aplicarAnalise(a, e));
      if (e.concluida)
        agendar(() => lojaAnalises.definir((a) => removerAnalise(a, e.analiseId)), PERMANENCIA_ANALISE_MS);
      return;
    case "saude":
      void qc.invalidateQueries({ queryKey: chaves.saude });
      return;
  }
}

/** Liga o fluxo ao vivo enquanto a casca da aplicação está montada. */
export function useTempoReal(): void {
  const fonte = useFonte();
  const qc = useQueryClient();
  useEffect(
    () =>
      fonte.tempoReal({
        aoEvento: (e) => aplicarEvento(qc, e),
        aoEstado: (s) => lojaConexao.definir(() => s),
      }),
    [fonte, qc],
  );
}
