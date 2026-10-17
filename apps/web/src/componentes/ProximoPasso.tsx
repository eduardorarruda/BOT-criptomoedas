import { Link } from "@tanstack/react-router";
import { useEstrategias } from "../ganchos/consultas";

/**
 * O próximo passo de quem ainda não tem robô: sem estratégia, criar a estratégia (o robô
 * precisa de uma); com estratégia, criar o robô. Usado nas telas vazias.
 */
export function ProximoPasso({ variante = "primario" }: { readonly variante?: "primario" | "secundario" }) {
  const estrategias = useEstrategias().data;
  if (!estrategias) return null;
  const classe = `botao botao--${variante}`;
  return estrategias.length === 0 ? (
    <Link to="/estrategias" className={classe}>
      Criar uma estratégia
    </Link>
  ) : (
    <Link to="/robos" className={classe}>
      Criar um robô
    </Link>
  );
}
