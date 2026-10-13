import { useLayoutEffect, useRef } from "react";
import { useMenosMovimento } from "../ganchos/movimento";
import { interpolarDecimal } from "../lib/interpolar";

/**
 * Número que conta até o valor novo em vez de pular. A interpolação é em Decimal
 * (interpolarDecimal) e o texto é escrito direto no DOM a cada quadro, sem
 * re-renderizar o React. Leitores de tela recebem só o valor final. O laço é um
 * requestAnimationFrame simples: o `animate` do Motion custava ~14 kB na barra do topo.
 */
interface Props {
  readonly valor: string;
  readonly formatar: (texto: string) => string;
  readonly className?: string;
  readonly duracao?: number;
}

/** Desacelera no fim (ease-out quártico), perto da curva [0.16, 1, 0.3, 1] de antes. */
const desacelerar = (t: number): number => 1 - (1 - t) ** 4;

/** Chama `aoAvancar(progresso)` a cada quadro até `duracao` segundos; devolve o cancelamento. */
function animarProgresso(
  duracao: number,
  aoAvancar: (t: number) => void,
  aoTerminar: () => void,
): () => void {
  const inicio = performance.now();
  let quadro = 0;
  const passo = (agora: number): void => {
    const t = Math.min(1, (agora - inicio) / (duracao * 1000));
    if (t >= 1) {
      aoTerminar();
      return;
    }
    aoAvancar(desacelerar(t));
    quadro = requestAnimationFrame(passo);
  };
  quadro = requestAnimationFrame(passo);
  return () => cancelAnimationFrame(quadro);
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
    return animarProgresso(
      duracao,
      (t) => escrever(interpolarDecimal(de, valor, t)),
      () => escrever(valor),
    );
  }, [valor, menos, duracao]);

  return (
    <span className={`num ${className ?? ""}`}>
      <span ref={visivel} aria-hidden="true" />
      <span className="so-leitor">{formatar(valor)}</span>
    </span>
  );
}
