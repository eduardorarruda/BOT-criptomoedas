import { ShieldCheck } from "lucide-react";
import { Painel } from "../../componentes/Cabecalho";
import type { Medidor } from "../../lib/aovivo/risco";
import { formatarDinheiro, formatarPercentual } from "../../lib/formatar";
import { nomeDoFusoDaInstancia } from "../../lib/fuso";

const NIVEL = { ok: "dentro do limite", atencao: "perto do limite", limite: "no limite" } as const;

function textoDe(m: Medidor, valor: string): string {
  return m.id === "ordens" ? valor : formatarDinheiro(valor);
}

function Barra({ m }: { readonly m: Medidor }) {
  const valor = m.valor === null ? "—" : textoDe(m, m.valor);
  const limite = textoDe(m, m.limite);
  const descricao =
    m.valor === null
      ? `${m.rotulo}: não deu para calcular com as ordens carregadas`
      : `${m.rotulo}: ${valor} de ${limite}, ${NIVEL[m.nivel]}`;
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
        aria-valuetext={descricao}
      >
        <span className="medidor__barra" style={{ transform: `scaleX(${m.fracao})` }} />
      </div>
      {m.nivel !== "ok" ? (
        <p className="medidor__aviso">
          {m.nivel === "limite"
            ? "No limite: o risco barra novas compras."
            : `Em ${formatarPercentual(m.fracao, { casas: 0 })} do limite.`}
        </p>
      ) : null}
    </li>
  );
}

/** Quanto falta para cada limite que o motor de risco confere a cada decisão. */
export function MedidoresRisco({ medidores }: { readonly medidores: readonly Medidor[] }) {
  return (
    <Painel
      titulo="Limites de risco"
      id="titulo-medidores"
      acoes={<ShieldCheck size={16} aria-hidden="true" className="apagado" />}
    >
      <ul role="list" className="medidores">
        {medidores.map((m) => (
          <Barra key={m.id} m={m} />
        ))}
      </ul>
      <p className="medidores__nota">O dia começa à meia-noite ({nomeDoFusoDaInstancia()}), como no motor.</p>
    </Painel>
  );
}
