import { m } from "motion/react";
import { useId } from "react";
import { useMenosMovimento } from "../ganchos/movimento";

/**
 * O símbolo: o ensō a pincel (o mesmo do site) com a vela no centro. O círculo é a
 * calma, a vela é a decisão. Animado, o pincel desenha o anel num traço só e a vela
 * sobe do meio — a mesma sequência do topo do site.
 *
 * O anel vem da textura do pincel (`/enso.webp`) usada como máscara e pintada com a
 * cor do tom: `marca` (jade, para a marca e os avatares) ou `tinta` (papel de arroz
 * no tema escuro, tinta no claro, para as telas grandes como a de entrar).
 */
interface Props {
  readonly tamanho?: number;
  readonly animar?: boolean;
  readonly rotulo?: string;
  readonly className?: string;
  readonly tom?: "marca" | "tinta";
}

const LADO = 1140;
/** Traço do pincel que revela o anel (as coordenadas do hero do site, no espaço do ensō). */
const PINCELADA = "M468.9 975.6A418 418 0 1 1 620.9 984.9";
const ORIGEM_CENTRO = { transformBox: "fill-box", transformOrigin: "50% 50%" } as const;
const CURVA_PINCEL = [0.42, 0.05, 0.3, 1] as const;
const CURVA_VELA = [0.2, 0.9, 0.3, 1.2] as const;

export function Enso({ tamanho = 32, animar = false, rotulo, className, tom = "marca" }: Props) {
  const menos = useMenosMovimento();
  const mover = animar && !menos;
  const id = useId().replace(/:/g, "");
  const acessivel = rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true };
  const classes = ["enso", `enso--${tom}`, className].filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${LADO} ${LADO}`} width={tamanho} height={tamanho} className={classes} {...acessivel}>
      <defs>
        <mask
          id={`anel-${id}`}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={LADO}
          height={LADO}
          style={{ maskType: "alpha" }}
        >
          <image href="/enso.webp" width={LADO} height={LADO} />
        </mask>
        {mover ? (
          <mask id={`pincel-${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={LADO} height={LADO}>
            <m.path
              d={PINCELADA}
              fill="none"
              stroke="#fff"
              strokeWidth={240}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.25, ease: CURVA_PINCEL }}
            />
          </mask>
        ) : null}
      </defs>
      <g mask={mover ? `url(#pincel-${id})` : undefined}>
        <rect className="enso__anel" width={LADO} height={LADO} mask={`url(#anel-${id})`} />
      </g>
      <m.rect
        className="enso__vela"
        x={544}
        y={383}
        width={18}
        height={400}
        rx={9}
        style={ORIGEM_CENTRO}
        initial={mover ? { scaleY: 0.3, opacity: 0 } : false}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 1.15, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      />
      <m.rect
        className="enso__vela"
        x={515}
        y={467}
        width={76}
        height={232}
        rx={10}
        style={ORIGEM_CENTRO}
        initial={mover ? { scaleY: 0 } : false}
        animate={{ scaleY: 1 }}
        transition={{ delay: 1.05, duration: 0.55, ease: CURVA_VELA }}
      />
    </svg>
  );
}
