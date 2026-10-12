import {
  DIAS_MAXIMOS_PRECISAO_MINUTO,
  TAXA_BINANCE_BNB,
  TAXA_BINANCE_VIP0,
  type ConfiguracaoBacktestEntrada,
  type Intervalo,
  type RoboDTO,
} from "@zentrade/contratos/esquemas";
import { Play, SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { Segmentado } from "../../componentes/Segmentado";
import { useEstrategias, useRobos } from "../../ganchos/consultas";
import { useCriarBacktest } from "../../ganchos/mutacoes";

const DIA = 86_400_000;
const PERIODOS = [
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "180", rotulo: "180 dias" },
  { valor: "365", rotulo: "1 ano" },
  { valor: "730", rotulo: "2 anos" },
] as const;
const MODOS = [
  { valor: "rolante", rotulo: "Rolante" },
  { valor: "ancorada", rotulo: "Ancorada" },
] as const;
const BPS_MAXIMO = 100;

type Periodo = (typeof PERIODOS)[number]["valor"];

interface Avancado {
  taxa: "vip0" | "bnb";
  deslizamento: string;
  meioSpread: string;
  /** "padrao", "sem" ou o id de um robô cujos limites valem. */
  limites: string;
  precisaoMinuto: boolean;
  fracaoDentro: string;
  janelas: string;
  modoJanelas: "rolante" | "ancorada";
  ruina: string;
}

const AVANCADO_INICIAL: Avancado = {
  taxa: "vip0",
  deslizamento: "5",
  meioSpread: "2",
  limites: "padrao",
  precisaoMinuto: false,
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
    validacao: {
      fracaoDentroDaAmostra: Number(a.fracaoDentro),
      janelas: Number(a.janelas),
      modoJanelas: a.modoJanelas,
      limiteRuina: Number(a.ruina),
    },
  };
}

function CamposAvancados({
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
    </div>
  );
}

export function FormBacktest() {
  const estrategias = useEstrategias().data ?? [];
  const robos = useRobos().data ?? [];
  const criar = useCriarBacktest();
  const avisar = useAvisos();
  const [estrategiaId, setEstrategiaId] = useState("");
  const [simbolo, setSimbolo] = useState("BTCUSDT");
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const [dias, setDias] = useState<Periodo>("365");
  const [avancado, setAvancado] = useState(AVANCADO_INICIAL);
  const escolhida = estrategias.find((e) => e.id === estrategiaId) ?? estrategias[0];
  const bpsValidos = lerBps(avancado.deslizamento) !== null && lerBps(avancado.meioSpread) !== null;

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (!escolhida || !bpsValidos) return;
    const fim = Date.now();
    criar.mutate(
      {
        estrategiaId: escolhida.id,
        versao: escolhida.versao,
        simbolo,
        intervalo,
        inicio: fim - Number(dias) * DIA,
        fim,
        configuracao: configuracaoDoFormulario(avancado, Number(dias), robos),
      },
      {
        onSuccess: () => avisar("info", "Backtest na fila. O resultado aparece aqui quando terminar."),
        onError: (er) => avisar("erro", mensagemDe(er)),
      },
    );
  };

  return (
    <form className="bt-form" onSubmit={enviar}>
      <div className="formulario formulario--linha">
        <CampoSelecao
          rotulo="Estratégia"
          value={escolhida?.id ?? ""}
          onChange={(e) => setEstrategiaId(e.target.value)}
        >
          {estrategias.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} (v{x.versao})
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao rotulo="Par" value={simbolo} onChange={(e) => setSimbolo(e.target.value)}>
          {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Intervalo"
          value={intervalo}
          onChange={(e) => setIntervalo(e.target.value as Intervalo)}
        >
          {(["15m", "1h", "4h", "1d"] as const).map((i) => (
            <option key={i}>{i}</option>
          ))}
        </CampoSelecao>
        <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
        <Botao
          type="submit"
          variante="primario"
          icone={Play}
          carregando={criar.isPending}
          disabled={!escolhida || !bpsValidos}
        >
          Rodar backtest
        </Botao>
      </div>
      <details className="bt-avancado">
        <summary>
          <SlidersHorizontal size={14} aria-hidden="true" /> Custos, limites e validação{" "}
          <span className="apagado">
            (padrão: taxa 0,1%, deslizamento 5 + meio spread 2 pontos-base, limites do robô, 70/30)
          </span>
        </summary>
        <CamposAvancados
          a={avancado}
          mudar={(p) => setAvancado((atual) => ({ ...atual, ...p }))}
          dias={Number(dias)}
          robos={robos}
        />
      </details>
    </form>
  );
}
