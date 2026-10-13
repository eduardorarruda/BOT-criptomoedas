import type { ReactNode } from "react";

/**
 * Caixa que rola para os lados quando a tabela não cabe (celular). Recebe foco para
 * dar para rolar pelo teclado (WCAG 2.1.1) e é uma região com nome, que o leitor de
 * tela anuncia antes da tabela.
 */
export function TabelaRolagem({
  rotulo,
  className,
  children,
}: {
  readonly rotulo: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={className ? `tabela-rolagem ${className}` : "tabela-rolagem"}
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label={rotulo}
    >
      {children}
    </div>
  );
}
