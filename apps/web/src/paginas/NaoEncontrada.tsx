import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Enso } from "../componentes/Enso";

/** Endereço que não existe: a marca, uma frase calma e o caminho de volta. */
export function NaoEncontrada() {
  return (
    <main className="pagina-solta nao-encontrada">
      <div className="nao-encontrada__conteudo">
        <Enso tamanho={104} animar />
        <p className="rotulo-caixa nao-encontrada__codigo">Erro 404</p>
        <h1 className="titulo-serif nao-encontrada__titulo">Esta página não existe</h1>
        <p className="nao-encontrada__texto">
          O endereço pode ter mudado ou estar com um erro de digitação. Nada foi alterado nos seus robôs.
        </p>
        <Link to="/" className="botao botao--primario">
          <ArrowLeft size={16} aria-hidden="true" />
          Ir para a visão geral
        </Link>
      </div>
    </main>
  );
}
