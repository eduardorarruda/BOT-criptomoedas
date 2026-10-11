import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";

type Variante = "primario" | "secundario" | "fantasma" | "perigo";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variante?: Variante;
  readonly icone?: LucideIcon;
  readonly carregando?: boolean;
  readonly pequeno?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

export function Botao({
  variante = "secundario",
  icone: Icone,
  carregando = false,
  pequeno = false,
  children,
  disabled,
  className = "",
  type = "button",
  ...resto
}: Props) {
  const classe = `botao botao--${variante} ${pequeno ? "botao--pequeno" : ""} ${className}`.trim();
  return (
    <button
      type={type}
      className={classe}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? (
        <LoaderCircle className="girar" size={16} aria-hidden="true" />
      ) : Icone ? (
        <Icone size={16} strokeWidth={2} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
