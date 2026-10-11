import { formatarDinheiro, sinalDe } from "../lib/formatar";
import { NumeroAnimado } from "./NumeroAnimado";

/** Valor em dólar com cor por papel (ganho/perda) e, se pedido, contagem animada. */
interface Props {
  readonly valor: string;
  readonly sinal?: boolean;
  readonly colorir?: boolean;
  readonly animar?: boolean;
  readonly casas?: number;
  readonly className?: string;
}

export function Dinheiro({
  valor,
  sinal = false,
  colorir = false,
  animar = false,
  casas = 2,
  className = "",
}: Props) {
  const tom = colorir ? sinalDe(valor) : "neutro";
  const classe = `${tom === "neutro" ? "" : tom} ${className}`.trim();
  const formatar = (t: string): string => formatarDinheiro(t, { sinal, casas });
  if (animar) return <NumeroAnimado valor={valor} formatar={formatar} className={classe} />;
  return <span className={`num ${classe}`}>{formatar(valor)}</span>;
}
