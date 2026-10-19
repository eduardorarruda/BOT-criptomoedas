import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { Botao } from "../../componentes/Botao";
import { chaves } from "../../ganchos/chaves";
import { acompanharImportacao, type ApiImportacaoB3 } from "./apiB3";

type Situacao =
  | { readonly tipo: "parado" }
  | { readonly tipo: "andando"; readonly texto: string }
  | { readonly tipo: "pronto"; readonly texto: string }
  | { readonly tipo: "erro"; readonly texto: string };

const ANDAMENTO = { na_fila: "Na fila do motor…", lendo: "Buscando no MetaTrader 5 e gravando…" } as const;

/**
 * "Atualizar dados do WIN": pede ao motor para buscar no MetaTrader 5 o que falta desde a
 * última vela (na primeira vez, o máximo de histórico que a corretora entregar) e acompanha
 * o andamento. Precisa da conta demo cadastrada em Contas e chaves e do perfil mt5 ligado.
 */
export function AtualizarWin({
  api,
  intervaloMs,
  aoConcluir,
}: {
  readonly api: ApiImportacaoB3;
  readonly intervaloMs?: number;
  readonly aoConcluir?: () => void;
}) {
  const qc = useQueryClient();
  const [s, setS] = useState<Situacao>({ tipo: "parado" });
  const andando = s.tipo === "andando";

  const atualizar = async () => {
    setS({ tipo: "andando", texto: ANDAMENTO.na_fila });
    try {
      const criada = await api.atualizarMt5();
      const fim = await acompanharImportacao(
        api,
        criada.id,
        (atual) =>
          setS({ tipo: "andando", texto: atual.estado === "lendo" ? ANDAMENTO.lendo : ANDAMENTO.na_fila }),
        intervaloMs,
      );
      if (fim.estado === "concluida") {
        const dias = fim.resumo?.dias.length ?? 0;
        setS({
          tipo: "pronto",
          texto: dias === 0 ? "Nada novo para gravar." : `${dias} pregões atualizados.`,
        });
        void qc.invalidateQueries({ queryKey: chaves.dadosWin });
        aoConcluir?.();
      } else setS({ tipo: "erro", texto: fim.erro ?? "Não deu para atualizar." });
    } catch (e) {
      setS({ tipo: "erro", texto: mensagemDe(e) });
    }
  };

  return (
    <div className="atualizar-win">
      <Botao icone={RefreshCw} carregando={andando} onClick={() => void atualizar()}>
        Atualizar dados do WIN
      </Botao>
      <p className="apagado atualizar-win__status" role="status" aria-live="polite">
        {s.tipo === "parado" ? (
          "Busca no MetaTrader 5 o que falta (precisa da conta demo em Contas e chaves)."
        ) : s.tipo === "erro" ? (
          <>
            <CircleAlert size={14} aria-hidden="true" /> {s.texto}
          </>
        ) : s.tipo === "pronto" ? (
          <>
            <CircleCheck size={14} aria-hidden="true" /> {s.texto}
          </>
        ) : (
          s.texto
        )}
      </p>
    </div>
  );
}
