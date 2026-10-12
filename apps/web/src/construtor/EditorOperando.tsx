import {
  INDICADORES,
  nomeIndicador,
  type CampoCandle,
  type GrupoIndicador,
  type Indicador,
  type Operando,
  type OperandoIndicador,
  type ParametroIndicador,
} from "@zentrade/dominio";
import { useState } from "react";
import { lerDecimalDigitado, paraCampo } from "../lib/entrada";

/**
 * Edita um lado da comparação: preço, campo do candle, número, indicador (com os
 * parâmetros e a linha escolhida) ou múltiplo de outro. Os indicadores vêm do
 * catálogo do domínio: indicador novo lá aparece aqui sem mexer na tela.
 */
type TipoEscolha = "preco" | "numero" | "multiplicar" | CampoCandle | Indicador;

const BASICOS: readonly { valor: TipoEscolha; rotulo: string }[] = [
  { valor: "preco", rotulo: "Preço (fechamento)" },
  { valor: "numero", rotulo: "Número" },
  { valor: "multiplicar", rotulo: "Múltiplo de…" },
];
const CANDLE: readonly { valor: CampoCandle; rotulo: string }[] = [
  { valor: "abertura", rotulo: "Abertura" },
  { valor: "maxima", rotulo: "Máxima" },
  { valor: "minima", rotulo: "Mínima" },
  { valor: "volume", rotulo: "Volume" },
];
const GRUPOS: readonly { grupo: GrupoIndicador; rotulo: string }[] = [
  { grupo: "tendencia", rotulo: "Tendência" },
  { grupo: "momento", rotulo: "Momento" },
  { grupo: "volatilidade", rotulo: "Volatilidade" },
  { grupo: "volume", rotulo: "Volume" },
];
const POR_GRUPO = GRUPOS.map(({ grupo, rotulo }) => ({
  rotulo,
  indicadores: (Object.keys(INDICADORES) as Indicador[]).filter((n) => INDICADORES[n].grupo === grupo),
}));

const escolhaDe = (op: Operando): TipoEscolha => (op.tipo === "indicador" ? op.nome : op.tipo);

export function padraoPara(t: TipoEscolha): Operando {
  switch (t) {
    case "preco":
    case "abertura":
    case "maxima":
    case "minima":
    case "volume":
      return { tipo: t };
    case "numero":
      return { tipo: "numero", valor: 30 };
    case "multiplicar":
      return { tipo: "multiplicar", fator: 1.02, operando: { tipo: "indicador", nome: "sma", periodo: 50 } };
    default:
      return INDICADORES[t].padrao;
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

/** Parâmetros e linha do indicador: "Bollinger ( 20 ; 2 ) [banda inferior]". */
function ParametrosIndicador({
  operando,
  rotulo,
  aoMudar,
}: {
  readonly operando: OperandoIndicador;
  readonly rotulo: string;
  readonly aoMudar: (o: Operando) => void;
}) {
  const definicao = INDICADORES[operando.nome];
  const nome = nomeIndicador(operando.nome);
  const valores = operando as unknown as Record<ParametroIndicador, number> & { saida?: string };
  return (
    <>
      <span className="operando__sep" aria-hidden="true">
        (
      </span>
      {definicao.parametros.map((p, i) => (
        <span key={`${operando.nome}-${p.campo}`} className="operando__parametro">
          {i > 0 ? (
            <span className="operando__sep" aria-hidden="true">
              ;
            </span>
          ) : null}
          <NumeroLivre
            inteiro={p.campo !== "desvios"}
            valor={valores[p.campo]}
            rotulo={`${rotulo}: ${p.rotulo} de ${nome}`}
            aoMudar={(n) => aoMudar({ ...operando, [p.campo]: n } as Operando)}
          />
        </span>
      ))}
      <span className="operando__sep" aria-hidden="true">
        )
      </span>
      {definicao.saidas.length ? (
        <select
          className="operando__saida"
          aria-label={`${rotulo}: linha de ${nome}`}
          value={valores.saida}
          onChange={(e) => aoMudar({ ...operando, saida: e.target.value } as Operando)}
        >
          {definicao.saidas.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
      ) : null}
    </>
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
  const titulo = operando.tipo === "indicador" ? INDICADORES[operando.nome].descricao : undefined;
  return (
    <span className="operando">
      <select
        className="operando__tipo"
        aria-label={`${rotulo}: tipo`}
        title={titulo}
        value={escolha}
        onChange={(e) => aoMudar(padraoPara(e.target.value as TipoEscolha))}
      >
        {BASICOS.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
        <optgroup label="Último candle">
          {CANDLE.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </optgroup>
        {POR_GRUPO.map((g) => (
          <optgroup key={g.rotulo} label={g.rotulo}>
            {g.indicadores.map((n) => (
              <option key={n} value={n} title={INDICADORES[n].descricao}>
                {INDICADORES[n].titulo}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {operando.tipo === "numero" ? (
        <NumeroLivre
          valor={operando.valor}
          rotulo={`${rotulo}: valor`}
          aoMudar={(valor) => aoMudar({ ...operando, valor })}
        />
      ) : null}
      {operando.tipo === "indicador" ? (
        <ParametrosIndicador operando={operando} rotulo={rotulo} aoMudar={aoMudar} />
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
