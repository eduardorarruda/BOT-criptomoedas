import { Enso } from "./Enso";

/** Wordmark: "Zen" em Instrument Serif itálico jade + "Trade" em Geist 600. */
export function Marca({
  tamanho = 28,
  animar = false,
}: {
  readonly tamanho?: number;
  readonly animar?: boolean;
}) {
  return (
    <span className="marca">
      <Enso tamanho={tamanho} animar={animar} />
      <span className="marca__palavra" aria-label="ZenTrade">
        <span className="marca__zen" aria-hidden="true">
          Zen
        </span>
        <span className="marca__trade" aria-hidden="true">
          Trade
        </span>
      </span>
    </span>
  );
}
