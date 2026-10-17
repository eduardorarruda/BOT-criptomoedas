import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Etiqueta curta de estado. Sempre ícone + texto: a cor nunca é a única pista. */
export type Tom = "marca" | "ganho" | "perda" | "atencao" | "info" | "neutro";

/** `ponto` mostra um ponto na cor do tom no lugar do ícone (estado "vivo", "no ar"). */
export function Selo({
  tom = "neutro",
  icone: Icone,
  ponto = false,
  children,
}: {
  readonly tom?: Tom;
  readonly icone?: LucideIcon;
  readonly ponto?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <span className={`selo selo--${tom}`}>
      {Icone ? <Icone size={12} strokeWidth={2.2} aria-hidden="true" /> : null}
      {!Icone && ponto ? <span className="selo__ponto" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
