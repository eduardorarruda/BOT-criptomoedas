import { m } from "motion/react";
import { useMenosMovimento } from "../ganchos/movimento";

/**
 * O símbolo: Ensō (anel aberto) com um candle na abertura. Animado, o anel se
 * desenha num traço só e o candle sobe — a calma, depois a decisão.
 */
interface Props {
  readonly tamanho?: number;
  readonly animar?: boolean;
  readonly rotulo?: string;
  readonly className?: string;
}

const ANEL = "M98.64 49.65 A40 40 0 1 1 70.35 21.36";
const ORIGEM_BASE = { transformBox: "fill-box", transformOrigin: "50% 100%" } as const;

export function Enso({ tamanho = 32, animar = false, rotulo, className }: Props) {
  const menos = useMenosMovimento();
  const mover = animar && !menos;
  const acessivel = rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true };
  return (
    <svg viewBox="0 0 120 120" width={tamanho} height={tamanho} className={className} {...acessivel}>
      <m.path
        d={ANEL}
        fill="none"
        stroke="var(--anel-simbolo)"
        strokeWidth={9}
        initial={mover ? { pathLength: 0, opacity: 0.2 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
      />
      <m.line
        x1={84.5}
        y1={11}
        x2={84.5}
        y2={58}
        stroke="var(--marca)"
        strokeWidth={3}
        strokeLinecap="round"
        style={ORIGEM_BASE}
        initial={mover ? { scaleY: 0, opacity: 0 } : false}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 0.95, duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
      />
      <m.rect
        x={79}
        y={22}
        width={11}
        height={26}
        rx={1.5}
        fill="var(--marca)"
        style={ORIGEM_BASE}
        initial={mover ? { scaleY: 0, y: 14 } : false}
        animate={{ scaleY: 1, y: 0 }}
        transition={{ delay: 1.05, duration: 0.55, ease: [0.2, 0.9, 0.25, 1] }}
      />
    </svg>
  );
}
