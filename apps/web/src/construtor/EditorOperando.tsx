import type { Operando } from "@zentrade/dominio";
import { useState } from "react";
import { lerDecimalDigitado, paraCampo } from "../lib/entrada";

/** Edita um lado da comparação: preço, número, indicador (com período) ou múltiplo de outro. */
type TipoEscolha = "preco" | "numero" | "sma" | "ema" | "rsi" | "multiplicar";

const BASICOS: readonly { valor: TipoEscolha; rotulo: string }[] = [
  { valor: "preco", rotulo: "Preço" },
  { valor: "numero", rotulo: "Número" },
  { valor: "multiplicar", rotulo: "Múltiplo de…" },
];
const INDICADORES: readonly { valor: TipoEscolha; rotulo: string; titulo: string }[] = [
  { valor: "sma", rotulo: "SMA", titulo: "Média móvel simples" },
  { valor: "ema", rotulo: "EMA", titulo: "Média móvel exponencial" },
  { valor: "rsi", rotulo: "RSI", titulo: "Índice de força relativa (0 a 100)" },
];

const escolhaDe = (op: Operando): TipoEscolha => (op.tipo === "indicador" ? op.nome : op.tipo);

export function padraoPara(t: TipoEscolha): Operando {
  switch (t) {
    case "preco":
      return { tipo: "preco" };
    case "numero":
      return { tipo: "numero", valor: 30 };
    case "rsi":
      return { tipo: "indicador", nome: "rsi", periodo: 14 };
    case "sma":
    case "ema":
      return { tipo: "indicador", nome: t, periodo: 20 };
    case "multiplicar":
      return { tipo: "multiplicar", fator: 1.02, operando: { tipo: "indicador", nome: "sma", periodo: 50 } };
  }
}

function NumeroLivre({
  valor,
  rotulo,
  aoMudar,
  inteiro = false,
}: {
  valor: number;
  rotulo: string;
  aoMudar: (n: number) => void;
  inteiro?: boolean;
}) {
  const [texto, setTexto] = useState(() => paraCampo(String(valor)));
  const lido = lerDecimalDigitado(texto);
  const valido = lido !== null && (!inteiro || /^\d+$/.test(lido));
  return (
    <input
      className={`operando__numero num ${inteiro ? "operando__numero--curto" : ""}`}
      inputMode={inteiro ? "numeric" : "decimal"}
      aria-label={rotulo}
      aria-invalid={!valido || undefined}
      title={valido ? undefined : inteiro ? "Digite um número inteiro" : "Digite um número, como 30 ou 1,02"}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = lerDecimalDigitado(e.target.value);
        if (n !== null && (!inteiro || /^\d+$/.test(n))) aoMudar(Number(n));
      }}
    />
  );
}

export function EditorOperando({
  operando,
  rotulo,
  aoMudar,
}: {
  readonly operando: Operando;
  readonly rotulo: string;
  readonly aoMudar: (o: Operando) => void;
}) {
  const escolha = escolhaDe(operando);
  return (
    <span className="operando">
      <select
        className="operando__tipo"
        aria-label={`${rotulo}: tipo`}
        value={escolha}
        onChange={(e) => aoMudar(padraoPara(e.target.value as TipoEscolha))}
      >
        {BASICOS.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
        <optgroup label="Indicadores">
          {INDICADORES.map((o) => (
            <option key={o.valor} value={o.valor} title={o.titulo}>
              {o.rotulo}
            </option>
          ))}
        </optgroup>
      </select>
      {operando.tipo === "numero" ? (
        <NumeroLivre
          valor={operando.valor}
          rotulo={`${rotulo}: valor`}
          aoMudar={(valor) => aoMudar({ ...operando, valor })}
        />
      ) : null}
      {operando.tipo === "indicador" ? (
        <>
          <span className="operando__sep" aria-hidden="true">
            (
          </span>
          <NumeroLivre
            inteiro
            valor={operando.periodo}
            rotulo={`${rotulo}: período de ${operando.nome.toUpperCase()}`}
            aoMudar={(periodo) => aoMudar({ ...operando, periodo })}
          />
          <span className="operando__sep" aria-hidden="true">
            )
          </span>
        </>
      ) : null}
      {operando.tipo === "multiplicar" ? (
        <>
          <NumeroLivre
            valor={operando.fator}
            rotulo={`${rotulo}: fator`}
            aoMudar={(fator) => aoMudar({ ...operando, fator })}
          />
          <span className="operando__sep" aria-hidden="true">
            ×
          </span>
          <EditorOperando
            operando={operando.operando}
            rotulo={`${rotulo}, multiplicado`}
            aoMudar={(o) => aoMudar({ ...operando, operando: o })}
          />
        </>
      ) : null}
    </span>
  );
}
