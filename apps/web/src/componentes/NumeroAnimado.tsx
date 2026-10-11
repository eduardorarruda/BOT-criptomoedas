import { animate } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { useMenosMovimento } from "../ganchos/movimento";
import { interpolarDecimal } from "../lib/interpolar";

/**
 * Número que conta até o valor novo em vez de pular. A interpolação é em Decimal
 * (interpolarDecimal) e o texto é escrito direto no DOM a cada quadro, sem
 * re-renderizar o React. Leitores de tela recebem só o valor final.
 */
interface Props {
  readonly valor: string;
  readonly formatar: (texto: string) => string;
  readonly className?: string;
  readonly duracao?: number;
}

export function NumeroAnimado({ valor, formatar, className, duracao = 0.7 }: Props) {
  const visivel = useRef<HTMLSpanElement>(null);
  const atual = useRef<string | null>(null);
  const menos = useMenosMovimento();
  const formatarRef = useRef(formatar);

  useLayoutEffect(() => {
    formatarRef.current = formatar;
  });

  useLayoutEffect(() => {
    const el = visivel.current;
    if (!el) return;
    const de = atual.current;
    const escrever = (texto: string): void => {
      atual.current = texto;
      el.textContent = formatarRef.current(texto);
    };
    if (de === null || menos || de === valor) {
      escrever(valor);
      return;
    }
    escrever(de);
    const controle = animate(0, 1, {
      duration: duracao,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (t) => escrever(interpolarDecimal(de, valor, t)),
      onComplete: () => escrever(valor),
    });
    return () => controle.stop();
  }, [valor, menos, duracao]);

  return (
    <span className={`num ${className ?? ""}`}>
      <span ref={visivel} aria-hidden="true" />
      <span className="so-leitor">{formatar(valor)}</span>
    </span>
  );
}
