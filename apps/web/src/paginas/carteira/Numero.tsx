import { Dinheiro } from "../../componentes/Dinheiro";
import {
  formatarDinheiro,
  formatarPercentual,
  formatarPreco,
  formatarQuantidade,
  TRACO,
} from "../../lib/formatar";
import type { Formato } from "./tabela";

/**
 * Um número da carteira no formato da coluna. Null não vira zero: aparece um traço
 * com a explicação (sem preço, custo desconhecido) no title e para o leitor de tela.
 */
export function Numero({
  valor,
  formato,
  porQueVazio = "desconhecido",
}: {
  readonly valor: string | null;
  readonly formato: Formato;
  readonly porQueVazio?: string;
}) {
  if (valor === null)
    return (
      <span className="apagado" title={porQueVazio}>
        {TRACO}
        <span className="so-leitor"> ({porQueVazio})</span>
      </span>
    );
  switch (formato) {
    case "resultado":
      return <Dinheiro valor={valor} sinal colorir />;
    case "dinheiro":
      return <span className="num">{formatarDinheiro(valor)}</span>;
    case "preco":
      return <span className="num">{formatarPreco(valor)}</span>;
    case "quantidade":
      return <span className="num">{formatarQuantidade(valor)}</span>;
    case "percentual":
      return <span className="num">{formatarPercentual(valor, { casas: 2 })}</span>;
    default:
      return <span>{valor}</span>;
  }
}
