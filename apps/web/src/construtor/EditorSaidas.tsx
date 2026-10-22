import type { Dispatch } from "react";
import { CampoTexto } from "../componentes/Campo";
import { Segmentado } from "../componentes/Segmentado";
import type { Acao, EstadoConstrutor } from "./estado";
import type { EstadoSaidas, TipoMovel, TipoStop } from "./saidas";

/**
 * Proteção, alvo e as saídas opcionais: stop fixo ou por ATR, stop móvel, empate,
 * saída por tempo e tamanho (pela volatilidade ou por alocação). Cada opção liga os próprios campos.
 */
type CampoTextoSaida = {
  [K in keyof EstadoSaidas]: EstadoSaidas[K] extends string ? K : never;
}[keyof EstadoSaidas];

/** Os dois jeitos de definir o tamanho não convivem: ligar um desliga o outro. */
function mudancaDoInterruptor(
  chave: "empate" | "tempo" | "tamanho" | "alocacao",
  ligado: boolean,
): Partial<EstadoSaidas> {
  if (chave === "tamanho" && ligado) return { tamanho: true, alocacao: false };
  if (chave === "alocacao" && ligado) return { alocacao: true, tamanho: false };
  return { [chave]: ligado };
}

export function EditorSaidas({
  estado,
  despachar,
}: {
  readonly estado: EstadoConstrutor;
  readonly despachar: Dispatch<Acao>;
}) {
  const s = estado.saidas;
  const mudar = (mudanca: Partial<EstadoSaidas>): void => despachar({ tipo: "saidas", mudanca });
  const campo = (chave: CampoTextoSaida, rotulo: string, dica?: string) => (
    <CampoTexto
      rotulo={rotulo}
      {...(dica ? { dica } : {})}
      inputMode="decimal"
      value={s[chave]}
      onChange={(e) => mudar({ [chave]: e.target.value })}
      className="campo--num"
    />
  );
  const interruptor = (chave: "empate" | "tempo" | "tamanho" | "alocacao", rotulo: string) => (
    <label className="interruptor">
      <input
        type="checkbox"
        checked={s[chave]}
        onChange={(e) => mudar(mudancaDoInterruptor(chave, e.target.checked))}
      />
      <span>{rotulo}</span>
    </label>
  );

  return (
    <>
      <fieldset className="construtor__parametros">
        <legend>Proteção e alvo</legend>
        <div className="construtor__linha">
          <Segmentado<TipoStop>
            rotulo="Tipo de stop"
            opcoes={[
              { valor: "percentual", rotulo: "Fixo (%)" },
              { valor: "atr", rotulo: "Pela volatilidade (ATR)" },
            ]}
            valor={s.tipoStop}
            aoMudar={(tipoStop) => mudar({ tipoStop })}
          />
        </div>
        <CampoTexto
          rotulo={s.tipoStop === "atr" ? "Stop máximo (%)" : "Stop (%)"}
          dica={
            s.tipoStop === "atr"
              ? "O stop por ATR nunca fica mais longe que isto da entrada."
              : "Queda máxima a partir da entrada. Toda compra tem stop."
          }
          inputMode="decimal"
          value={estado.stop}
          onChange={(e) => despachar({ tipo: "parametro", campo: "stop", valor: e.target.value })}
          className="campo--num"
        />
        {s.tipoStop === "atr" ? (
          <>
            {campo("stopAtrMultiplo", "Quantos ATR abaixo", "Stop = entrada − este número × ATR.")}
            {campo("stopAtrPeriodo", "Período do ATR", "Candles da média de amplitude (Wilder).")}
          </>
        ) : null}
        <CampoTexto
          rotulo="Alvo líquido (%)"
          dica="Lucro que sobra depois das duas taxas."
          inputMode="decimal"
          value={estado.alvo}
          onChange={(e) => despachar({ tipo: "parametro", campo: "alvo", valor: e.target.value })}
          className="campo--num"
        />
        <CampoTexto
          rotulo="Taxa por ponta (%)"
          dica="Taxa da corretora em cada ordem (Binance: 0,1%)."
          inputMode="decimal"
          value={estado.taxa}
          onChange={(e) => despachar({ tipo: "parametro", campo: "taxa", valor: e.target.value })}
          className="campo--num"
        />
      </fieldset>
      <fieldset className="construtor__parametros construtor__saidas">
        <legend>Saídas e tamanho</legend>
        <div className="construtor__linha">
          <Segmentado<TipoMovel>
            rotulo="Stop móvel (só sobe, nunca desce)"
            opcoes={[
              { valor: "desligado", rotulo: "Desligado" },
              { valor: "percentual", rotulo: "Por %" },
              { valor: "atr", rotulo: "Por ATR" },
            ]}
            valor={s.movel}
            aoMudar={(movel) => mudar({ movel })}
          />
        </div>
        {s.movel === "percentual"
          ? campo("movelDistancia", "Distância da máxima (%)", "Abaixo da maior máxima desde a entrada.")
          : null}
        {s.movel === "atr" ? (
          <>
            {campo("movelMultiplo", "Quantos ATR da máxima", "Stop = maior máxima − este número × ATR.")}
            {campo("movelPeriodo", "Período do ATR do stop móvel")}
          </>
        ) : null}
        <div className="construtor__linha">
          {interruptor("empate", "Levar o stop ao empate (break-even)")}
        </div>
        {s.empate
          ? campo("empateGatilho", "Depois de subir (%)", "O stop vai para o preço que paga as duas taxas.")
          : null}
        <div className="construtor__linha">{interruptor("tempo", "Sair por tempo")}</div>
        {s.tempo ? campo("tempoCandles", "Depois de quantos candles", "Candles do intervalo do robô.") : null}
        <div className="construtor__linha">{interruptor("tamanho", "Tamanho pela volatilidade (ATR)")}</div>
        {s.tamanho ? (
          <>
            {campo(
              "tamanhoMultiplo",
              "Quantos ATR de risco",
              "Quantidade = risco por operação ÷ (este número × ATR).",
            )}
            {campo("tamanhoPeriodo", "Período do ATR do tamanho")}
          </>
        ) : null}
        <div className="construtor__linha">
          {interruptor("alocacao", "Tamanho por alocação (fração da exposição máxima)")}
        </div>
        {s.alocacao
          ? campo(
              "alocacaoFracao",
              "Fração da exposição máxima (%)",
              "Compra este tanto da exposição máxima do robô, limitado ao saldo livre, sem dividir pelo risco por operação. Para estratégias sem stop de verdade, como o cofre de tendência: o stop vira só proteção contra desastre.",
            )
          : null}
      </fieldset>
    </>
  );
}
