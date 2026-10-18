import { formatarDinheiro, sinalDe, type Moeda } from "../lib/formatar";
import { NumeroAnimado } from "./NumeroAnimado";

/** Valor em dólar (ou em reais, no mini índice) com cor por papel e, se pedido, contagem animada. */
interface Props {
  readonly valor: string;
  readonly sinal?: boolean;
  readonly colorir?: boolean;
  readonly animar?: boolean;
  readonly casas?: number;
  readonly moeda?: Moeda;
  readonly className?: string;
}

export function Dinheiro({
  valor,
  sinal = false,
  colorir = false,
  animar = false,
  casas = 2,
  moeda,
  className = "",
}: Props) {
  const tom = colorir ? sinalDe(valor) : "neutro";
  const classe = `${tom === "neutro" ? "" : tom} ${className}`.trim();
  const formatar = (t: string): string => formatarDinheiro(t, { sinal, casas, ...(moeda ? { moeda } : {}) });
  if (animar) return <NumeroAnimado valor={valor} formatar={formatar} className={classe} />;
  return <span className={`num ${classe}`}>{formatar(valor)}</span>;
}
