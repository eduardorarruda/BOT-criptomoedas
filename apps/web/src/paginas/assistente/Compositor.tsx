import { LIMITE_PERGUNTA } from "@zentrade/contratos/esquemas";
import { ArrowUp, Square } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

/** A partir de quanto do limite o contador aparece. */
const AVISO_LIMITE = 0.9;
/** Tecla 229 = o teclado ainda está compondo (IME de japonês, chinês, acentos no celular). */
const TECLA_COMPONDO = 229;

const formatador = new Intl.NumberFormat("pt-BR");

/** A caixa cresce com o texto até um teto (no CSS); passando dele, rola por dentro. */
function useCrescer(caixaRef: RefObject<HTMLTextAreaElement | null>, texto: string) {
  useLayoutEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [caixaRef, texto]);
}

/**
 * Caixa da pergunta: Enter envia, Shift+Enter quebra a linha (e Enter durante a
 * composição do teclado não envia). Durante a resposta, o botão vira "Parar".
 */
export function Compositor({
  emAndamento,
  bloqueio,
  aoEnviar,
  aoParar,
  rodape,
  entradaRef,
}: {
  readonly emAndamento: boolean;
  /** Motivo para não dar para perguntar agora (null = pode). */
  readonly bloqueio: string | null;
  readonly aoEnviar: (texto: string) => void;
  readonly aoParar: () => void;
  readonly rodape?: ReactNode;
  readonly entradaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [texto, setTexto] = useState("");
  const proprioRef = useRef<HTMLTextAreaElement>(null);
  const caixaRef = entradaRef ?? proprioRef;
  useCrescer(caixaRef, texto);
  const idMotivo = useId();
  const idContador = useId();
  const restam = LIMITE_PERGUNTA - texto.length;
  const mostrarContador = texto.length >= LIMITE_PERGUNTA * AVISO_LIMITE;
  const podeEnviar = texto.trim() !== "" && !emAndamento && !bloqueio;

  const enviar = (e?: FormEvent) => {
    e?.preventDefault();
    if (!podeEnviar) return;
    aoEnviar(texto.trim());
    setTexto("");
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === TECLA_COMPONDO) return;
    e.preventDefault();
    enviar();
  };
  const descricao = [bloqueio ? idMotivo : null, mostrarContador ? idContador : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form className={`compositor ${bloqueio ? "compositor--bloqueado" : ""}`} onSubmit={enviar}>
      <label htmlFor="pergunta" className="so-leitor">
        Sua pergunta
      </label>
      <textarea
        id="pergunta"
        ref={caixaRef}
        className="compositor__entrada"
        rows={1}
        maxLength={LIMITE_PERGUNTA}
        placeholder={
          bloqueio
            ? "O assistente não pode responder agora"
            : "Pergunte sobre os seus robôs, carteira ou títulos…"
        }
        value={texto}
        disabled={bloqueio !== null}
        aria-describedby={descricao || undefined}
        enterKeyHint="send"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={tecla}
      />
      {bloqueio ? (
        <p id={idMotivo} className="compositor__motivo">
          {bloqueio}
        </p>
      ) : null}
      <div className="compositor__rodape">
        <div className="compositor__extra">{rodape}</div>
        {mostrarContador ? (
          <span
            id={idContador}
            className={`compositor__contador ${restam <= 0 ? "compositor__contador--fim" : ""}`}
          >
            {restam > 0
              ? `Restam ${formatador.format(restam)} caracteres`
              : `Chegou ao limite de ${formatador.format(LIMITE_PERGUNTA)} caracteres`}
          </span>
        ) : null}
        {emAndamento ? (
          <button
            type="button"
            className="compositor__botao compositor__botao--parar"
            onClick={aoParar}
            aria-label="Parar a resposta"
            title="Parar (Esc)"
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            className="compositor__botao"
            aria-label="Enviar"
            title="Enviar (Enter)"
            disabled={!podeEnviar}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}
