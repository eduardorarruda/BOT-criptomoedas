import { FlaskConical } from "lucide-react";

/** Faixa fixa do modo de demonstração: ninguém confunde exemplo com conta real. */
export function AvisoDemo() {
  return (
    <div className="aviso-demo" role="note">
      <FlaskConical size={15} aria-hidden="true" />
      <p>
        <strong>Modo de exemplo.</strong> Dados fictícios gerados no seu navegador; o mercado é simulado. Nada
        aqui é dinheiro real nem resultado de verdade.
      </p>
    </div>
  );
}
