import type { OrdemDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { useCallback, useMemo, type ReactNode } from "react";
import type { CandleApi, RegistroAoVivo } from "../../api/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import type { CoresGrafico } from "../../componentes/graficos/cores";
import { GraficoCandles, type LinhaPreco } from "../../componentes/graficos/GraficoCandles";
import { marcadoresExecucoes } from "../../componentes/graficos/velas";
import { PrecoAoVivo } from "../../componentes/PrecoAoVivo";
import { Selo } from "../../componentes/Selo";
import { useCandles, useDecisoes, useEstrategias, useOrdens, usePosicoes } from "../../ganchos/consultas";
import { lojaPrecos } from "../../ganchos/lojas";
import { useAgora } from "../../ganchos/useAgora";
import { useTelaEstreita } from "../../ganchos/useTelaEstreita";
import { compraQueAbriu, linhasProtecao, type LinhasProtecao } from "../../lib/aovivo/protecao";
import { medidores } from "../../lib/aovivo/risco";
import { formatarPreco } from "../../lib/formatar";
import { useLoja } from "../../lib/loja";
import { MODO_ROBO } from "../../lib/rotulos";
import { CartaoPosicao } from "./CartaoPosicao";
import { MedidoresRisco } from "./MedidoresRisco";

const SEM_ORDENS: readonly OrdemDTO[] = [];
/** Ao vivo interessa o agora: as últimas velas na tela, o resto a um arrasto. */
const JANELA_VELAS = 90;
const INTERVALO: Record<string, string> = {
  "1m": "1 min",
  "5m": "5 min",
  "15m": "15 min",
  "30m": "30 min",
  "1h": "1 h",
  "4h": "4 h",
  "1d": "1 dia",
};

const LEGENDA = [
  { rotulo: "Compra", classe: "legenda--compra" },
  { rotulo: "Venda", classe: "legenda--venda" },
];

function linhasDoGrafico(p: LinhasProtecao | null, precoMedio: string | undefined): LinhaPreco[] {
  if (!p) return [];
  return [
    { preco: p.alvo, rotulo: "Alvo", cor: "ganho" },
    ...(precoMedio ? [{ preco: precoMedio, rotulo: "Entrada", cor: "apagado" as const }] : []),
    { preco: p.stop, rotulo: "Stop", cor: "perda" },
  ];
}

/** Os candles fechados que chegaram ao vivo para este robô (no intervalo dele). */
function fechadasDe(registros: readonly RegistroAoVivo[], intervalo: string): CandleApi[] {
  return registros.flatMap((r) =>
    r.evento.tipo === "candle" && r.evento.intervalo === intervalo ? [r.evento.candle] : [],
  );
}

function Grafico(p: {
  readonly robo: RoboDTO;
  readonly ordens: readonly OrdemDTO[];
  readonly fechadas: readonly CandleApi[];
  readonly linhas: readonly LinhaPreco[];
}) {
  const { robo } = p;
  const velas = useCandles(robo.simbolo, robo.intervalo);
  const precoAoVivo = useLoja(lojaPrecos, (s) => s[robo.simbolo]);
  const ultima = velas.data?.at(-1);
  const estreita = useTelaEstreita();
  const marcar = useCallback(
    (cores: CoresGrafico, inicio: number) =>
      marcadoresExecucoes(p.ordens, robo.intervalo, cores, inicio, estreita),
    [p.ordens, robo.intervalo, estreita],
  );
  const modo = MODO_ROBO[robo.modo];
  return (
    <Painel className="painel--grafico aovivo-grafico">
      <div className="cotacao">
        <h2 className="cotacao__par">{robo.nome}</h2>
        <span className="cotacao__preco">
          <PrecoAoVivo simbolo={robo.simbolo} {...(ultima ? { reserva: ultima.fecha } : {})} />
        </span>
        <span className="aovivo-grafico__selos">
          <Selo>
            {robo.simbolo.replace("USDT", "/USDT")} · {INTERVALO[robo.intervalo]}
          </Selo>
          <Selo icone={modo.icone}>{modo.texto}</Selo>
        </span>
      </div>
      {velas.isPending ? <Esqueleto altura={380} rotulo="Carregando os candles" /> : null}
      {velas.error ? <ErroCarregar erro={velas.error} tentarDeNovo={() => void velas.refetch()} /> : null}
      {velas.data ? (
        <GraficoCandles
          velas={velas.data}
          intervalo={robo.intervalo}
          marcar={marcar}
          precoAoVivo={precoAoVivo}
          fechadas={p.fechadas}
          linhas={p.linhas}
          altura={380}
          janela={JANELA_VELAS}
          rotulo={`Candles de ${robo.simbolo} em ${INTERVALO[robo.intervalo]} com as compras e vendas do robô${p.linhas.length ? " e as linhas de stop, entrada e alvo da posição aberta" : ""}. Último preço ${formatarPreco(precoAoVivo?.preco ?? ultima?.fecha ?? "")}.`}
        />
      ) : null}
      <ul role="list" className="legenda" aria-label="Legenda do gráfico">
        {LEGENDA.map((l) => (
          <li key={l.rotulo} className={l.classe}>
            <span aria-hidden="true" />
            {l.rotulo}
          </li>
        ))}
        <li className="legenda--linha-stop">
          <span aria-hidden="true" />
          Stop
        </li>
        <li className="legenda--linha-alvo">
          <span aria-hidden="true" />
          Alvo
        </li>
      </ul>
    </Painel>
  );
}

interface Props {
  readonly robo: RoboDTO;
  readonly registros: readonly RegistroAoVivo[];
  /** A linha do tempo e o cartão "pensando" entram nas colunas daqui. */
  readonly linha: ReactNode;
  readonly pensando: ReactNode;
}

/** Um robô: gráfico ao vivo, posição contando, limites de risco. */
export function PainelRobo({ robo, registros, linha, pensando }: Props) {
  const ordens = useOrdens(robo.id).data ?? SEM_ORDENS;
  const [posicao] = usePosicoes([robo.id]);
  const estrategia = useEstrategias().data?.find((e) => e.id === robo.estrategiaId);
  const compra = compraQueAbriu(useDecisoes({ roboId: robo.id, limite: 50 }).data ?? []);
  const tique = useLoja(lojaPrecos, (s) => s[robo.simbolo]?.preco ?? null);
  const ultimaVela = useCandles(robo.simbolo, robo.intervalo).data?.at(-1);
  // Até o primeiro preço ao vivo, vale o fechamento do último candle.
  const preco = tique ?? ultimaVela?.fecha ?? null;
  const protecao = linhasProtecao(posicao?.data, estrategia, compra);
  const agora = useAgora(5000);
  const fechadas = useMemo(() => fechadasDe(registros, robo.intervalo), [registros, robo.intervalo]);
  const linhas = useMemo(
    () => linhasDoGrafico(protecao, posicao?.data?.precoMedio),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando os níveis mudam de fato
    [protecao?.stop, protecao?.alvo, posicao?.data?.precoMedio],
  );
  const quantidade = posicao?.data?.quantidade ?? "0";
  return (
    <section className="aovivo-grade" aria-label={`Robô ${robo.nome}`}>
      <div className="aovivo-coluna">
        <div className="aovivo-area-grafico">
          <Grafico robo={robo} ordens={ordens} fechadas={fechadas} linhas={linhas} />
        </div>
        <div className="aovivo-area-linha">{linha}</div>
      </div>
      <div className="aovivo-coluna">
        <div className="aovivo-area-posicao">
          <CartaoPosicao
            robo={robo}
            posicao={{
              ...(posicao?.data ? { data: posicao.data } : {}),
              error: posicao?.error ?? null,
              refetch: () => posicao?.refetch(),
            }}
            preco={preco}
            protecao={protecao}
          />
        </div>
        <div className="aovivo-area-pensando">{pensando}</div>
        <div className="aovivo-area-risco">
          <MedidoresRisco
            medidores={medidores({ limites: robo.limites, ordens, quantidade, preco, agora })}
          />
        </div>
      </div>
    </section>
  );
}
