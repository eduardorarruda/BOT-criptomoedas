import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Etiqueta curta de estado. Sempre ícone + texto: a cor nunca é a única pista. */
export type Tom = "marca" | "ganho" | "perda" | "atencao" | "neutro";

export function Selo({
  tom = "neutro",
  icone: Icone,
  children,
}: {
  readonly tom?: Tom;
  readonly icone?: LucideIcon;
  readonly children: ReactNode;
}) {
  return (
    <span className={`selo selo--${tom}`}>
      {Icone ? <Icone size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
