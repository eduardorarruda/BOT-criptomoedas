import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Botão de segurar para confirmar (parada total). Um clique rápido não faz nada:
 * é preciso segurar pelo tempo inteiro (mouse, toque, Espaço ou Enter). A barra
 * mostra o progresso; soltar antes cancela. O tempo é contado por relógio, não
 * pela animação, então com menos movimento a regra é a mesma.
 */
interface Props {
  readonly aoConfirmar: () => void;
  readonly children: ReactNode;
  readonly duracaoMs?: number;
  readonly dica?: string;
  readonly desabilitado?: boolean;
  readonly tom?: "perigo" | "marca";
}

const TECLAS = new Set([" ", "Enter"]);

export function BotaoSegurar({
  aoConfirmar,
  children,
  duracaoMs = 1500,
  dica,
  desabilitado = false,
  tom = "perigo",
}: Props) {
  const [segurando, setSegurando] = useState(false);
  const [aviso, setAviso] = useState("");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmou = useRef(false);
  const idDica = useId();
  const segundos = (duracaoMs / 1000).toLocaleString("pt-BR");

  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  const comecar = (): void => {
    if (desabilitado || relogio.current) return;
    confirmou.current = false;
    setSegurando(true);
    setAviso("Continue segurando…");
    relogio.current = setTimeout(() => {
      relogio.current = null;
      confirmou.current = true;
      setSegurando(false);
      setAviso("");
      aoConfirmar();
    }, duracaoMs);
  };

  const soltar = (): void => {
    if (!relogio.current) return;
    clearTimeout(relogio.current);
    relogio.current = null;
    setSegurando(false);
    if (!confirmou.current) setAviso(`Soltou antes da hora. Segure por ${segundos} s até a barra encher.`);
  };

  return (
    <div className="segurar">
      <button
        type="button"
        className={`segurar__botao segurar__botao--${tom}`}
        data-segurando={segurando || undefined}
        style={{ "--segurar-ms": `${duracaoMs}ms` } as CSSProperties}
        disabled={desabilitado}
        aria-describedby={idDica}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          comecar();
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onLostPointerCapture={soltar}
        onKeyDown={(e) => {
          if (!TECLAS.has(e.key)) return;
          e.preventDefault();
          if (!e.repeat) comecar();
        }}
        onKeyUp={(e) => {
          if (TECLAS.has(e.key)) soltar();
        }}
        onBlur={soltar}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="segurar__progresso" aria-hidden="true" />
        <span className="segurar__rotulo">{children}</span>
      </button>
      <p id={idDica} className="segurar__dica">
        {dica ?? `Segure por ${segundos} s para confirmar (mouse, toque, Espaço ou Enter).`}
      </p>
      <p className="segurar__aviso" aria-live="polite">
        {aviso}
      </p>
    </div>
  );
}
