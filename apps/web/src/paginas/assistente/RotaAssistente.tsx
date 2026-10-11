import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { Assistente } from "./Assistente";

/** O assistente na rota: a conversa aberta fica no endereço (`?conversa=<id>`), para voltar e compartilhar o link. */
export function RotaAssistente() {
  const { conversa } = useSearch({ strict: false });
  const navegar = useNavigate();
  const aoTrocarConversa = useCallback(
    (id: string | null) =>
      void navegar({
        to: "/assistente",
        search: id ? { conversa: id } : {},
        replace: true,
        resetScroll: false,
      }),
    [navegar],
  );
  return <Assistente conversaInicial={conversa ?? null} aoTrocarConversa={aoTrocarConversa} />;
}
