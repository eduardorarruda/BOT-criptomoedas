import type { DecisaoDTO, OrdemDTO, PosicaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFonte } from "../api/contexto";
import type { EventoTela } from "../api/fonte";
import { aplicarAnalise, aplicarOrdem, aplicarRobo, removerAnalise } from "./atualizarCache";
import { chaves } from "./chaves";
import { categoriaDe, juntarRegistros } from "../lib/aovivo/eventos";
import { lojaAnalises, lojaAoVivo, lojaBarreiras, lojaConexao, lojaPrecos, lojaUltimoEvento } from "./lojas";
import { gravarDecisao } from "./mutacoes";

/** Tempo que o cartão "pensando" fica na tela depois que a análise vira decisão. */
const PERMANENCIA_ANALISE_MS = 4000;
const MAXIMO_BARREIRAS = 20;

/** O robô de uma decisão já carregada (a ordem ao vivo só diz a decisão). */
function roboDaDecisao(qc: QueryClient, decisaoId: string): string | undefined {
  for (const [, lista] of qc.getQueriesData<DecisaoDTO[]>({ queryKey: chaves.decisoesTodas }))
    for (const d of lista ?? []) if (d.id === decisaoId) return d.roboId;
  for (const r of lojaAoVivo.obter())
    if (r.evento.tipo === "decisao" && r.evento.decisao.id === decisaoId) return r.evento.decisao.roboId;
  return undefined;
}

/** Ordem nova: entra na lista geral e na do robô dela; lista de robô que não dá para saber, recarrega. */
function aplicarOrdemNasListas(qc: QueryClient, o: OrdemDTO): void {
  const dono = roboDaDecisao(qc, o.decisaoId);
  for (const [chave, lista] of qc.getQueriesData<OrdemDTO[]>({ queryKey: chaves.ordensTodas })) {
    if (!lista) continue;
    const doRobo = chave[1];
    if (doRobo === "todas" || doRobo === dono) qc.setQueryData(chave, aplicarOrdem(lista, o));
    else if (!dono || lista.some((x) => x.id === o.id)) void qc.invalidateQueries({ queryKey: chave });
  }
}

export function aplicarEvento(qc: QueryClient, e: EventoTela, agendar = setTimeout, agora = Date.now): void {
  lojaUltimoEvento.definir(() => agora());
  if (categoriaDe(e)) lojaAoVivo.definir((a) => juntarRegistros(a, [{ recebidoEm: agora(), evento: e }]));
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
      aplicarOrdemNasListas(qc, e.ordem);
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
    case "posicao": {
      const { tipo: _t, em: _em, ...posicao } = e;
      qc.setQueryData<PosicaoDTO>(chaves.posicao(e.roboId), posicao);
      return;
    }
    case "saude":
      void qc.invalidateQueries({ queryKey: chaves.saude });
      return;
    case "candle":
    case "sinal":
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
