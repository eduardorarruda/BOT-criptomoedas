import { FlaskConical } from "lucide-react";

/** Faixa fixa do modo de demonstração: ninguém confunde exemplo com conta real. */
export function AvisoDemo() {
  return (
    <aside className="aviso-demo" aria-label="Modo de exemplo">
      <FlaskConical size={16} aria-hidden="true" />
      <p>
        <strong>Modo de exemplo.</strong> Dados fictícios gerados no seu navegador; o mercado é simulado. Nada
        aqui é dinheiro real nem resultado de verdade.
      </p>
    </aside>
  );
}
