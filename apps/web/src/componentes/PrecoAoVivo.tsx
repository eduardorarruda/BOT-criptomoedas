import { dec } from "@zentrade/dominio";
import { lojaPrecos } from "../ganchos/lojas";
import { formatarPreco } from "../lib/formatar";
import { useLoja } from "../lib/loja";

/**
 * Último preço ao vivo. A cada tique o número pisca brevemente na cor da direção
 * (subiu/desceu) — a única forma de ver o mercado andando sem olhar o gráfico.
 */
export function PrecoAoVivo({ simbolo, reserva }: { readonly simbolo: string; readonly reserva?: string }) {
  const tique = useLoja(lojaPrecos, (s) => s[simbolo]);
  const preco = tique?.preco ?? reserva;
  if (!preco) return <span className="num apagado">—</span>;
  let direcao = "";
  if (tique?.anterior) {
    const diferenca = dec(tique.preco).comparedTo(tique.anterior);
    direcao = diferenca > 0 ? "sobe" : diferenca < 0 ? "desce" : "";
  }
  return (
    <span key={tique?.em ?? 0} className={`num preco-tique ${direcao ? `preco-tique--${direcao}` : ""}`}>
      {formatarPreco(preco)}
      {direcao ? <span className="so-leitor">{direcao === "sobe" ? " (subiu)" : " (caiu)"}</span> : null}
    </span>
  );
}
