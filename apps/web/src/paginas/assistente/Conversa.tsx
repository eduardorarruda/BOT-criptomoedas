import type { MensagemAssistente } from "@zentrade/contratos/esquemas";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Enso } from "../../componentes/Enso";
import { Ferramentas, Fontes, MensagemChat } from "./MensagemChat";
import { Markdown } from "./Markdown";
import type { RespostaAoVivo } from "./useRespostaAoVivo";

export const SUGESTOES = [
  "Como foi o meu dia hoje?",
  "Por que o robô não comprou na última decisão?",
  "Quais decisões o risco barrou nesta semana, e por quê?",
  "O que o meu conhecimento diz sobre taxas de saque?",
  "Resuma como estão os meus robôs.",
] as const;

const LIMITE = 8000;

/** A resposta chegando: o que já foi consultado, o texto com cursor e as fontes no fim. */
export function BalaoAoVivo({ r }: { readonly r: RespostaAoVivo }) {
  return (
    <>
      <li className="chat__msg chat__msg--pessoa">
        <p className="chat__balao">{r.usuario?.texto ?? r.pergunta}</p>
      </li>
      <li className="chat__msg chat__msg--assistente" aria-live="polite" aria-busy="true">
        <Enso tamanho={22} className="chat__avatar respirar" />
        <div className="chat__corpo">
          <Ferramentas lista={r.ferramentas} />
          {r.texto ? (
            <div className="chat__escrevendo">
              <Markdown texto={r.texto} />
            </div>
          ) : (
            <p className="chat__pensando apagado">Pensando com os seus dados…</p>
          )}
          <Fontes lista={r.fontes} />
        </div>
      </li>
    </>
  );
}

/** As mensagens da conversa, rolando para o fim conforme a resposta chega. */
export function ListaMensagens({
  mensagens,
  aoVivo,
}: {
  readonly mensagens: readonly MensagemAssistente[];
  readonly aoVivo: RespostaAoVivo | null;
}) {
  const fim = useRef<HTMLDivElement>(null);
  const tamanho = aoVivo?.texto.length ?? 0;
  useEffect(() => {
    fim.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens.length, tamanho]);
  return (
    <div className="chat__rolagem">
      <ol className="chat__mensagens" role="list" aria-label="Mensagens">
        {mensagens.map((msg) => (
          <MensagemChat key={msg.id} msg={msg} />
        ))}
        {aoVivo ? <BalaoAoVivo r={aoVivo} /> : null}
      </ol>
      <div ref={fim} />
    </div>
  );
}

export function Sugestoes({ aoEscolher }: { readonly aoEscolher: (texto: string) => void }) {
  return (
    <div className="chat__vazio">
      <Enso tamanho={56} animar rotulo="ZenTrade" />
      <p className="chat__vazio-titulo titulo-serif">Pergunte sobre os seus dados</p>
      <p className="apagado">
        O assistente lê o seu resumo, robôs, decisões, ordens e a sua base de conhecimento — e mostra de onde
        tirou cada coisa.
      </p>
      <ul className="chat__sugestoes" role="list">
        {SUGESTOES.map((s) => (
          <li key={s}>
            <button type="button" className="chat__sugestao" onClick={() => aoEscolher(s)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Caixa da pergunta: Enter envia, Shift+Enter quebra a linha; durante a resposta vira "Parar". */
export function CaixaPergunta({
  ocupado,
  aoEnviar,
  aoParar,
}: {
  readonly ocupado: boolean;
  readonly aoEnviar: (texto: string) => void;
  readonly aoParar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const enviar = (e?: FormEvent) => {
    e?.preventDefault();
    const limpo = texto.trim();
    if (!limpo || ocupado) return;
    aoEnviar(limpo);
    setTexto("");
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) enviar(e);
  };
  return (
    <form className="chat__caixa" onSubmit={enviar}>
      <label htmlFor="pergunta" className="so-leitor">
        Sua pergunta
      </label>
      <textarea
        id="pergunta"
        className="chat__entrada"
        rows={1}
        maxLength={LIMITE}
        placeholder="Pergunte sobre os seus robôs, decisões ou conhecimento…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={tecla}
      />
      {ocupado ? (
        <button type="button" className="chat__botao" onClick={aoParar} aria-label="Parar a resposta">
          <Square size={16} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="submit"
          className="chat__botao chat__botao--enviar"
          aria-label="Enviar"
          disabled={!texto.trim()}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
