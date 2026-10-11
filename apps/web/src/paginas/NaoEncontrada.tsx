import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { EstadoVazio } from "../componentes/Estados";

export function NaoEncontrada() {
  return (
    <div className="pagina-solta">
      <EstadoVazio
        icone={Compass}
        titulo="Esta página não existe"
        acao={
          <Link to="/" className="botao botao--primario">
            Ir para a visão geral
          </Link>
        }
      >
        O endereço pode ter mudado ou estar com um erro de digitação.
      </EstadoVazio>
    </div>
  );
}
