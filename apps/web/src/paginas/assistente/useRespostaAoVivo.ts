import { useQueryClient } from "@tanstack/react-query";
import type {
  Conversa,
  EventoChat,
  FerramentaUsada,
  FonteCitada,
  MensagemAssistente,
} from "@zentrade/contratos/esquemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { mensagemDe } from "../../api/erros";
import type { ApiAssistente } from "./api";

/** A resposta enquanto ela chega, para mostrar com animação antes de ser gravada. */
export interface RespostaAoVivo {
  readonly conversaId: string;
  readonly pergunta: string;
  readonly usuario: MensagemAssistente | null;
  readonly texto: string;
  readonly ferramentas: readonly FerramentaUsada[];
  readonly fontes: readonly FonteCitada[];
}

export const chavesAssistente = {
  estado: ["assistente", "estado"] as const,
  conversas: ["assistente", "conversas"] as const,
  conversa: (id: string) => ["assistente", "conversa", id] as const,
};

/** Aplica um evento do fluxo à resposta em andamento (o "fim" é tratado por quem chama). */
export function aplicarEvento(r: RespostaAoVivo, e: EventoChat): RespostaAoVivo {
  switch (e.tipo) {
    case "inicio":
      return { ...r, usuario: e.usuario };
    case "texto":
      return { ...r, texto: r.texto + e.delta };
    case "ferramenta":
      return { ...r, ferramentas: [...r.ferramentas, { nome: e.nome, descricao: e.descricao }] };
    case "fontes":
      return { ...r, fontes: e.fontes };
    default:
      return r;
  }
}

/** A conversa no cache ganha a pergunta e a resposta gravadas, sem recarregar tudo. */
export function comMensagens(
  c: Conversa | undefined,
  novas: readonly MensagemAssistente[],
): Conversa | undefined {
  if (!c) return c;
  const ids = new Set(c.mensagens.map((m) => m.id));
  return { ...c, mensagens: [...c.mensagens, ...novas.filter((m) => !ids.has(m.id))] };
}

/**
 * Envia a pergunta e acompanha a resposta em streaming. Ao terminar, grava no cache a
 * pergunta e a resposta (como a API gravou) e atualiza a lista de conversas.
 */
export function useRespostaAoVivo(api: ApiAssistente) {
  const qc = useQueryClient();
  const [aoVivo, setAoVivo] = useState<RespostaAoVivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => () => controle.current?.abort(), []);

  const enviar = useCallback(
    async (conversaId: string, pergunta: string) => {
      controle.current?.abort();
      const atual = new AbortController();
      controle.current = atual;
      setErro(null);
      let r: RespostaAoVivo = { conversaId, pergunta, usuario: null, texto: "", ferramentas: [], fontes: [] };
      setAoVivo(r);
      try {
        for await (const e of api.enviar(conversaId, pergunta, atual.signal)) {
          if (e.tipo === "fim") {
            const novas = r.usuario ? [r.usuario, e.mensagem] : [e.mensagem];
            qc.setQueryData<Conversa>(chavesAssistente.conversa(conversaId), (c) => comMensagens(c, novas));
          } else {
            r = aplicarEvento(r, e);
            setAoVivo(r);
          }
        }
      } catch (e) {
        if (!atual.signal.aborted) setErro(mensagemDe(e));
      } finally {
        if (controle.current === atual) controle.current = null;
        setAoVivo(null);
        void qc.invalidateQueries({ queryKey: chavesAssistente.conversas });
        void qc.invalidateQueries({ queryKey: chavesAssistente.conversa(conversaId) });
      }
    },
    [api, qc],
  );

  const parar = useCallback(() => controle.current?.abort(), []);
  return { aoVivo, erro, enviar, parar, limparErro: () => setErro(null) };
}
