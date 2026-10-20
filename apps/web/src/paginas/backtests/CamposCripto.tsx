import {
  DIAS_MAXIMOS_PRECISAO_MINUTO,
  TAXA_BINANCE_BNB,
  TAXA_BINANCE_VIP0,
  type ConfiguracaoBacktestEntrada,
  type ModoExecucaoBacktest,
  type RoboDTO,
} from "@zentrade/contratos/esquemas";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { Segmentado } from "../../componentes/Segmentado";

/**
 * Os campos avançados do backtest de cripto (custos em pontos-base, limites de um robô,
 * precisão de 1 minuto) e o grupo de validação, que o mini índice também usa.
 */
const MODOS = [
  { valor: "rolante", rotulo: "Rolante" },
  { valor: "ancorada", rotulo: "Ancorada" },
] as const;
const BPS_MAXIMO = 100;

export interface Avancado {
  taxa: "vip0" | "bnb";
  deslizamento: string;
  meioSpread: string;
  /** "padrao", "sem" ou o id de um robô cujos limites valem. */
  limites: string;
  precisaoMinuto: boolean;
  /** Onde executa a ordem decidida no fechamento do candle. */
  execucao: ModoExecucaoBacktest;
  fracaoDentro: string;
  janelas: string;
  modoJanelas: "rolante" | "ancorada";
  ruina: string;
}

export const AVANCADO_INICIAL: Avancado = {
  taxa: "vip0",
  deslizamento: "5",
  meioSpread: "2",
  limites: "padrao",
  precisaoMinuto: false,
  execucao: "fechamento",
  fracaoDentro: "0.7",
  janelas: "5",
  modoJanelas: "rolante",
  ruina: "0.3",
};

/** Pontos-base digitados: número de 0 a 100, com vírgula ou ponto. `null` se inválido. */
export function lerBps(texto: string): number | null {
  const n = Number(texto.trim().replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= BPS_MAXIMO ? n : null;
}

export function configuracaoDoFormulario(
  a: Avancado,
  dias: number,
  robos: readonly RoboDTO[],
): ConfiguracaoBacktestEntrada {
  const robo = robos.find((r) => r.id === a.limites);
  return {
    custos: {
      taxaPorLado: a.taxa === "bnb" ? TAXA_BINANCE_BNB : TAXA_BINANCE_VIP0,
      deslizamentoBps: lerBps(a.deslizamento) ?? 0,
      meioSpreadBps: lerBps(a.meioSpread) ?? 0,
    },
    risco:
      a.limites === "sem"
        ? { modo: "sem_limites" }
        : robo
          ? { modo: "robo", limites: robo.limites }
          : { modo: "robo" },
    precisaoMinuto: a.precisaoMinuto && dias <= DIAS_MAXIMOS_PRECISAO_MINUTO,
    execucao: a.execucao,
    validacao: validacaoDoFormulario(a),
  };
}

export function CamposAvancados({
  a,
  mudar,
  dias,
  robos,
}: {
  readonly a: Avancado;
  readonly mudar: (parcial: Partial<Avancado>) => void;
  readonly dias: number;
  readonly robos: readonly RoboDTO[];
}) {
  const precisaoPossivel = dias <= DIAS_MAXIMOS_PRECISAO_MINUTO;
  return (
    <div className="bt-avancado__grade">
      <fieldset className="bt-avancado__grupo">
        <legend>Custos em cada execução</legend>
        <CampoSelecao
          rotulo="Taxa da corretora por ponta"
          value={a.taxa}
          onChange={(e) => mudar({ taxa: e.target.value as Avancado["taxa"] })}
        >
          <option value="vip0">Binance VIP 0 — 0,1%</option>
          <option value="bnb">Pagando com BNB — 0,075%</option>
        </CampoSelecao>
        <CampoTexto
          rotulo="Deslizamento (pontos-base)"
          dica="5 = 0,05% contra você em toda ordem; inclui a demora entre decidir e executar."
          inputMode="decimal"
          value={a.deslizamento}
          erro={lerBps(a.deslizamento) === null ? `de 0 a ${BPS_MAXIMO}` : undefined}
          onChange={(e) => mudar({ deslizamento: e.target.value })}
        />
        <CampoTexto
          rotulo="Meio spread (pontos-base)"
          dica="Metade da diferença entre compra e venda no livro: ordem a mercado paga."
          inputMode="decimal"
          value={a.meioSpread}
          erro={lerBps(a.meioSpread) === null ? `de 0 a ${BPS_MAXIMO}` : undefined}
          onChange={(e) => mudar({ meioSpread: e.target.value })}
        />
      </fieldset>
      <fieldset className="bt-avancado__grupo">
        <legend>Risco e precisão</legend>
        <CampoSelecao
          rotulo="Limites de risco"
          dica="Os mesmos freios do robô: perda diária, exposição, ordens por hora, pausa após perda."
          value={a.limites}
          onChange={(e) => mudar({ limites: e.target.value })}
        >
          <option value="padrao">Os de um robô novo (padrão)</option>
          {robos.map((r) => (
            <option key={r.id} value={r.id}>
              Os do robô {r.nome}
            </option>
          ))}
          <option value="sem">Sem limites — menos realista</option>
        </CampoSelecao>
        <label className="interruptor">
          <input
            type="checkbox"
            checked={a.precisaoMinuto && precisaoPossivel}
            disabled={!precisaoPossivel}
            onChange={(e) => mudar({ precisaoMinuto: e.target.checked })}
          />
          <span>
            Precisão de 1 minuto{" "}
            <span className="apagado">
              {precisaoPossivel
                ? "(sabe se o stop ou o alvo veio primeiro dentro do candle)"
                : `(só em períodos de até ${DIAS_MAXIMOS_PRECISAO_MINUTO} dias)`}
            </span>
          </span>
        </label>
      </fieldset>
      <GrupoExecucao a={a} mudar={mudar} />
      <GrupoValidacao a={a} mudar={mudar} />
    </div>
  );
}

/** Onde a ordem decidida no fechamento do candle é executada (cripto e mini índice). */
export function GrupoExecucao({
  a,
  mudar,
}: {
  readonly a: Avancado;
  readonly mudar: (parcial: Partial<Avancado>) => void;
}) {
  return (
    <fieldset className="bt-avancado__grupo">
      <legend>Execução das ordens</legend>
      <CampoSelecao
        rotulo="Executar ordens"
        dica={
          a.execucao === "proximaAbertura"
            ? "O robô decide quando o candle fecha, mas a ordem só chega ao mercado no candle seguinte: o preço é o de abertura dele. Stop e alvo continuam valendo dentro do candle. No último candle da janela não há candle seguinte: a entrada não abre e a saída sai no fechamento."
            : "A ordem é executada pelo preço de fechamento do candle em que a regra deu o sinal, mais o deslizamento. É a forma mais simples, mas otimista: na prática o preço já mudou quando a ordem chega."
        }
        value={a.execucao}
        onChange={(e) => mudar({ execucao: e.target.value as ModoExecucaoBacktest })}
      >
        <option value="fechamento">No fechamento do candle do sinal</option>
        <option value="proximaAbertura">Na abertura do candle seguinte (mais conservador)</option>
      </CampoSelecao>
    </fieldset>
  );
}

/** Divisão dentro/fora da amostra, janelas do walk-forward e ruína do Monte Carlo. */
export function GrupoValidacao({
  a,
  mudar,
}: {
  readonly a: Avancado;
  readonly mudar: (parcial: Partial<Avancado>) => void;
}) {
  return (
    <fieldset className="bt-avancado__grupo">
      <legend>Validação</legend>
      <CampoSelecao
        rotulo="Dentro da amostra"
        dica="O começo do período; o resto é o teste fora da amostra."
        value={a.fracaoDentro}
        onChange={(e) => mudar({ fracaoDentro: e.target.value })}
      >
        <option value="0.6">60% / 40%</option>
        <option value="0.7">70% / 30%</option>
        <option value="0.8">80% / 20%</option>
      </CampoSelecao>
      <CampoSelecao
        rotulo="Janelas do walk-forward"
        value={a.janelas}
        onChange={(e) => mudar({ janelas: e.target.value })}
      >
        {["3", "4", "5", "6", "8"].map((j) => (
          <option key={j} value={j}>
            {j} janelas
          </option>
        ))}
      </CampoSelecao>
      <Segmentado
        rotulo="Janelas"
        opcoes={MODOS}
        valor={a.modoJanelas}
        aoMudar={(modoJanelas) => mudar({ modoJanelas })}
      />
      <CampoSelecao
        rotulo="Ruína no Monte Carlo"
        dica="Perder esta parte do capital em algum momento."
        value={a.ruina}
        onChange={(e) => mudar({ ruina: e.target.value })}
      >
        <option value="0.2">Perder 20%</option>
        <option value="0.3">Perder 30%</option>
        <option value="0.5">Perder 50%</option>
      </CampoSelecao>
    </fieldset>
  );
}

/** A parte da validação que vai no pedido (a mesma no cripto e no mini índice). */
export const validacaoDoFormulario = (
  a: Avancado,
): NonNullable<ConfiguracaoBacktestEntrada["validacao"]> => ({
  fracaoDentroDaAmostra: Number(a.fracaoDentro),
  janelas: Number(a.janelas),
  modoJanelas: a.modoJanelas,
  limiteRuina: Number(a.ruina),
});
