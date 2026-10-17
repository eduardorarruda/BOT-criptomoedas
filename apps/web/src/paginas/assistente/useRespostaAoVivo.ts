import { useQueryClient } from "@tanstack/react-query";
import type { Conversa } from "@zentrade/contratos/esquemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemDe } from "../../api/erros";
import type { ApiAssistente } from "./api";
import {
  comMensagens,
  emAndamento,
  novaResposta,
  reduzirResposta,
  type AcaoResposta,
  type RespostaAoVivo,
} from "./estado";

export const chavesAssistente = {
  estado: ["assistente", "estado"] as const,
  conversas: ["assistente", "conversas"] as const,
  conversa: (id: string) => ["assistente", "conversa", id] as const,
  tokenClaude: ["assistente", "token-claude"] as const,
};

const FIM_SEM_AVISO = "A resposta parou antes do fim. Tente de novo.";

/** O que o leitor de tela ouve quando a resposta acaba (não a cada pedaço de texto). */
function anuncioDe(r: RespostaAoVivo): string {
  if (r.situacao === "interrompida") return "A resposta foi interrompida.";
  if (r.situacao !== "concluida") return ""; // o erro já sai num role="alert"
  return r.final?.situacao === "ok" ? "Resposta pronta." : "A resposta terminou com erro.";
}

/**
 * Envia a pergunta e acompanha a resposta em streaming. Ao terminar, grava no cache a
 * pergunta e a resposta (como a API gravou) e atualiza a lista de conversas. Se a
 * resposta falhar antes de ser gravada, ela fica na tela com o erro para tentar de novo.
 */
export function useRespostaAoVivo(api: ApiAssistente) {
  const qc = useQueryClient();
  const [aoVivo, setAoVivo] = useState<RespostaAoVivo | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const controle = useRef<AbortController | null>(null);

  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      controle.current?.abort();
      controle.current = null;
    };
  }, []);

  const enviar = useCallback(
    async (conversaId: string, pergunta: string) => {
      controle.current?.abort();
      const atual = new AbortController();
      controle.current = atual;
      let r = novaResposta(conversaId, pergunta);
      const valendo = () => montado.current && controle.current === atual;
      const despachar = (a: AcaoResposta) => {
        r = reduzirResposta(r, a);
        if (valendo()) setAoVivo(r);
      };
      setAoVivo(r);
      setAnuncio("");
      try {
        for await (const e of api.enviar(conversaId, pergunta, atual.signal)) {
          if (e.tipo === "fim") {
            const novas = r.usuario ? [r.usuario, e.mensagem] : [e.mensagem];
            qc.setQueryData<Conversa>(chavesAssistente.conversa(conversaId), (c) => comMensagens(c, novas));
          }
          despachar({ tipo: "evento", evento: e });
        }
        if (atual.signal.aborted) despachar({ tipo: "parou" });
        else if (emAndamento(r)) despachar({ tipo: "falhou", mensagem: FIM_SEM_AVISO });
      } catch (e) {
        despachar(atual.signal.aborted ? { tipo: "parou" } : { tipo: "falhou", mensagem: mensagemDe(e) });
      }
      if (!valendo()) return;
      controle.current = null;
      setAnuncio(anuncioDe(r));
      void qc.invalidateQueries({ queryKey: chavesAssistente.conversas });
      await qc.invalidateQueries({ queryKey: chavesAssistente.conversa(conversaId) });
      // A versão gravada pela API substitui a da tela; sem ela (falhou antes de gravar), a da tela fica.
      const gravadas = qc.getQueryData<Conversa>(chavesAssistente.conversa(conversaId))?.mensagens ?? [];
      const iPergunta = r.usuario ? gravadas.findIndex((m) => m.id === r.usuario?.id) : -1;
      const respostaGravada = iPergunta >= 0 && gravadas[iPergunta + 1]?.papel === "assistente";
      const substituida = r.situacao === "concluida" || (r.situacao === "interrompida" && respostaGravada);
      if (substituida) setAoVivo((atual) => (atual === r ? null : atual));
    },
    [api, qc],
  );

  const parar = useCallback(() => controle.current?.abort(), []);
  return { aoVivo, anuncio, enviar, parar };
}
