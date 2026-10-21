import { configuracaoWin, mercadoDo, type AvisoBacktest } from "@zentrade/contratos/esquemas";
import { ListChecks } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { Selo } from "../../componentes/Selo";
import { formatarDinheiro } from "../../lib/formatar";
import { anos, pct } from "./formato";

/** O único aviso com base formal: o período é curto para o número de tentativas (MinBTL). */
function avisoDeTentativas(b: Backtest): AvisoBacktest[] {
  const minimo = b.tentativas?.anosMinimos;
  const testado = b.metricas?.anos;
  if (minimo === null || minimo === undefined || testado === undefined || testado >= minimo) return [];
  return [
    {
      codigo: "minbtl",
      nivel: "alerta",
      base: "formal",
      mensagem: `Com ${b.tentativas?.total ?? 0} tentativas, seriam precisos ${anos(minimo)} de dados para esse Sharpe não aparecer por acaso; o teste tem ${anos(testado)} (Bailey, Borwein, López de Prado e Zhu).`,
    },
  ];
}

/** 0,1% com uma casa; 0,075% com as três que precisa. */
const casasDaTaxa = (taxa: number) => (Number.isInteger(Math.round(taxa * 1e6) / 1000) ? 1 : 3);

const bps = (v: number) => `${v.toLocaleString("pt-BR")} ponto${v === 1 ? "" : "s"}-base`;

const reais = (v: string) => formatarDinheiro(v, { moeda: "R$" });

/** Onde as ordens do sinal foram executadas (nos dois mercados). */
function PremissaExecucao({ c }: { readonly c: NonNullable<Backtest["configuracao"]> }) {
  return (
    <li>
      <strong>Execução das ordens:</strong>{" "}
      {c.execucao === "proximaAbertura"
        ? "na abertura do candle seguinte ao sinal (mais conservador). Stop e alvo valem dentro do candle; no último candle não há seguinte: a entrada não abre e a saída sai no fechamento."
        : "no fechamento do candle do sinal (mais otimista: o preço já pode ter mudado quando a ordem chega)."}
    </li>
  );
}

/** O filtro de dia de evento com que o backtest rodou, e quantas entradas ele mexeu. */
function PremissaDiasDeEvento({
  b,
  c,
}: {
  readonly b: Backtest;
  readonly c: NonNullable<Backtest["configuracao"]>;
}) {
  const m = b.metricas;
  return (
    <li>
      <strong>Dias de evento (Copom, payroll, eleição):</strong>{" "}
      {c.diasDeEvento === "bloquear"
        ? `entradas bloqueadas nos dias de evento de alto impacto da sua agenda (as velas ficam). Sinais de entrada barrados: ${m?.entradasBarradasPorEvento ?? 0}.`
        : c.diasDeEvento === "reduzir"
          ? `nos dias de evento de alto impacto da sua agenda, a entrada leva metade do tamanho. Entradas reduzidas: ${m?.entradasReduzidasPorEvento ?? 0}.`
          : "ignorados: o backtest opera todos os dias (padrão)."}
    </li>
  );
}

/** O modelo do mini índice com que o backtest rodou. */
function PremissasWin({ b, c }: { readonly b: Backtest; readonly c: NonNullable<Backtest["configuracao"]> }) {
  const w = configuracaoWin(c);
  const ambiguos = b.metricas?.candlesAmbiguos;
  return (
    <ul className="bt-premissas" role="list">
      <li>
        <strong>Contrato:</strong> mini índice (WIN), R$ 0,20 por ponto por contrato, tick de 5 pontos,
        contratos inteiros.
      </li>
      <li>
        <strong>Custos por contrato, em cada lado:</strong> tarifa da B3 de {reais(w.tarifaB3PorContrato)} e
        corretagem de {reais(w.corretagemPorContrato)}; deslizamento de {w.deslizamentoTicks} tick(s) contra
        você em toda execução (entrada, stop, alvo e zeragem), com o preço levado ao tick contra você.
      </li>
      <li>
        <strong>Sessão (Brasília):</strong> entradas das {w.inicioEntradas} às {w.fimEntradas}
        {w.pularLeilaoAbertura ? ", fora o candle do leilão de abertura" : ""}; zeragem às {w.zeragem} (no
        fechamento desse candle) ou no último candle do dia. Nada dorme posicionado.
      </li>
      <li>
        <strong>Tamanho:</strong> risco de {reais(w.riscoPorOperacao)} por operação; contratos = risco ÷
        (pontos do stop × R$ 0,20 + custos de ida e volta), arredondado para baixo, até {w.contratosMaximos} e
        até o capital dividido pela margem de {reais(w.margemPorContrato)} por contrato (a corretora pode
        exigir mais).
      </li>
      <li>
        <strong>Stop e alvo:</strong> vigiados dentro do candle no pior caso: comprado, o stop é tocado pela
        mínima; vendido, pela máxima. Se stop e alvo cabem no mesmo candle, conta o stop
        {ambiguos ? ` (aconteceu em ${ambiguos} candle(s))` : ""}.
      </li>
      <li>
        <strong>Limites de risco:</strong>{" "}
        {c.risco.modo === "sem_limites"
          ? "nenhum (menos realista: o robô de verdade operaria menos)."
          : "perda diária de 2% do capital, 4 ordens por hora e pausa de 60 min depois de uma perda."}
      </li>
      <PremissaExecucao c={c} />
      <PremissaDiasDeEvento b={b} c={c} />
      <li>
        <strong>Referências:</strong> ficar de fora (zero) e sempre comprado na sessão (1 contrato da abertura
        à zeragem, todo pregão, com os mesmos custos). Comprar e segurar não faz sentido num futuro de day
        trade.
      </li>
      {b.metricas?.saldoInicial ? (
        <li>
          <strong>Capital simulado:</strong> {reais(b.metricas.saldoInicial)}; Sharpe anualizado pelos candles
          do pregão, sem taxa livre de risco.
        </li>
      ) : null}
    </ul>
  );
}

/** Com que custos, limites e regras o backtest rodou, e os avisos de amostra. */
export function Premissas({ b }: { readonly b: Backtest }) {
  const c = b.configuracao;
  const m = b.metricas;
  const avisos = [...(b.validacao?.avisos ?? []), ...avisoDeTentativas(b)];
  return (
    <Painel titulo="Premissas e avisos" id={`premissas-${b.id}`} icone={ListChecks}>
      {c && mercadoDo(c) === "win" ? (
        <PremissasWin b={b} c={c} />
      ) : c ? (
        <ul className="bt-premissas" role="list">
          <li>
            <strong>Taxa:</strong> {pct(c.custos.taxaPorLado, casasDaTaxa(c.custos.taxaPorLado))} por ponta
            (compra e venda).
          </li>
          <li>
            <strong>Deslizamento e spread:</strong> {bps(c.custos.deslizamentoBps)} +{" "}
            {bps(c.custos.meioSpreadBps)} de meio spread contra você em toda execução, inclusive no stop. A
            demora entre decidir e executar entra aqui; ordens são a mercado, como o robô faz.
          </li>
          <li>
            <strong>Limites de risco:</strong>{" "}
            {c.risco.modo === "sem_limites"
              ? "nenhum (menos realista: o robô de verdade operaria menos)."
              : c.risco.limites
                ? `os de um robô seu: perda diária ${formatarDinheiro(c.risco.limites.perdaDiariaMaxima)}, exposição ${formatarDinheiro(c.risco.limites.exposicaoMaxima)}, ${c.risco.limites.ordensPorHoraMax} ordens por hora, pausa de ${c.risco.limites.pausaAposPerdaMin} min após perda.`
                : "os de um robô novo (perda diária 2%, exposição 30%, risco 0,5% do saldo por operação, 4 ordens por hora, pausa de 60 min após perda)."}
          </li>
          <PremissaExecucao c={c} />
          <PremissaDiasDeEvento b={b} c={c} />
          <li>
            <strong>Stop e alvo:</strong> vigiados dentro do candle pela mínima e pela máxima
            {m?.precisaoMinuto ? ", no caminho dos candles de 1 minuto" : ""}. Se os dois cabem no mesmo
            candle, conta o stop (pior caso)
            {m?.candlesAmbiguos ? ` (aconteceu em ${m.candlesAmbiguos} candle(s))` : ""}.
          </li>
          {m?.saldoInicial ? (
            <li>
              <strong>Capital simulado:</strong> {formatarDinheiro(m.saldoInicial)}; sem taxa livre de risco
              no Sharpe.
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="bt-nota">
          Backtest de antes da validação: rodou só com a taxa da estratégia, sem deslizamento e com os limites
          relaxados, e o stop só no fechamento do candle. Rode de novo para ver com custos e validação.
        </p>
      )}
      {avisos.length ? (
        <ul className="bt-avisos" role="list" aria-label="Avisos de amostra">
          {avisos.map((a) => (
            <li key={a.codigo}>
              <Selo tom={a.nivel === "alerta" ? "perda" : "atencao"}>
                {a.nivel === "alerta" ? "Alerta" : "Atenção"}
              </Selo>
              <span>{a.mensagem}</span>
              <span className="apagado">{a.base === "formal" ? "(base publicada)" : "(regra prática)"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Painel>
  );
}
