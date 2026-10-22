import { Enso } from "./Enso";

/** A marca: o ensō a pincel com a vela e o nome "ZenTrade" em Instrument Serif, como no site. */
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
      <span className="marca__palavra">
        <span className="so-leitor">ZenTrade</span>
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
