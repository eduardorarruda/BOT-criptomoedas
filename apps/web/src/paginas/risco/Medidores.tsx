import { formatarDinheiro, formatarPercentual } from "../../lib/formatar";
import type { MedidorConta } from "./medidores";

const NIVEL = { ok: "dentro do limite", atencao: "perto do limite", limite: "no limite" } as const;

const formatar = (m: MedidorConta, v: string): string => (m.formato === "dinheiro" ? formatarDinheiro(v) : v);

function Medidor({ m }: { readonly m: MedidorConta }) {
  const valor = formatar(m, m.valor);
  if (m.limite === null)
    return (
      <li className="medidor medidor--livre">
        <div className="medidor__topo">
          <span>{m.rotulo}</span>
          <span className="num">
            {valor} <span className="apagado">sem limite</span>
          </span>
        </div>
      </li>
    );
  const limite = formatar(m, m.limite);
  return (
    <li className={`medidor medidor--${m.nivel}`}>
      <div className="medidor__topo">
        <span>{m.rotulo}</span>
        <span className="num">
          {valor} <span className="apagado">de {limite}</span>
        </span>
      </div>
      <div
        className="medidor__trilho"
        role="meter"
        aria-label={m.rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(m.fracao * 100)}
        aria-valuetext={`${m.rotulo}: ${valor} de ${limite}, ${NIVEL[m.nivel]}`}
      >
        <span className="medidor__barra" style={{ transform: `scaleX(${m.fracao})` }} />
      </div>
      {m.nivel !== "ok" ? (
        <p className="medidor__aviso">
          {m.nivel === "limite"
            ? "No limite: novas compras ficam barradas."
            : `Em ${formatarPercentual(m.fracao, { casas: 0 })} do limite.`}
        </p>
      ) : null}
    </li>
  );
}

/** Barras dos limites (valor de agora contra o limite); sem limite, só o valor. */
export function Medidores({ medidores }: { readonly medidores: readonly MedidorConta[] }) {
  return (
    <ul role="list" className="medidores">
      {medidores.map((m) => (
        <Medidor key={m.id} m={m} />
      ))}
    </ul>
  );
}
