import type { AvisoBacktest } from "@zentrade/contratos/esquemas";
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

/** Com que custos, limites e regras o backtest rodou, e os avisos de amostra. */
export function Premissas({ b }: { readonly b: Backtest }) {
  const c = b.configuracao;
  const m = b.metricas;
  const avisos = [...(b.validacao?.avisos ?? []), ...avisoDeTentativas(b)];
  return (
    <Painel titulo="Premissas e avisos" id={`premissas-${b.id}`} icone={ListChecks}>
      {c ? (
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
