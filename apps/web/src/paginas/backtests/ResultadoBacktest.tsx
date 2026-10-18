import { FlaskConical, TriangleAlert } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { formatarData } from "../../lib/tempo";
import { GraficosBacktest } from "./Graficos";
import { TEXTO_APROXIMACAO } from "./CamposWin";
import { KpisBacktest } from "./Kpis";
import { Premissas } from "./Premissas";
import { Tentativas } from "./Tentativas";
import { ImpostoWin } from "./ResultadoWin";
import { ValidacaoBacktest } from "./Validacao";
import { Veredito } from "./Veredito";
import "../imobiliario/imobiliario.css";
import "./backtests.css";

/**
 * Resultado de um backtest: veredito em português claro, indicadores, curvas contra o
 * buy and hold, validação (dentro/fora da amostra, walk-forward, Monte Carlo), tentativas
 * e premissas. Sempre marcado como simulação; nunca recomenda investir ou operar.
 */
export function ResultadoBacktest({ b, nome }: { readonly b: Backtest; readonly nome: string }) {
  if (!b.metricas || !b.curva) return null;
  return (
    <section className="simulacao bt-resultado" aria-labelledby={`sim-${b.id}`}>
      <p className="simulacao__selo">
        <FlaskConical size={14} aria-hidden="true" /> Simulação com dados passados · não é dinheiro real
      </p>
      <h2 id={`sim-${b.id}`} className="simulacao__titulo">
        {nome} v{b.versao} · {b.simbolo} {b.intervalo} · {formatarData(b.inicio)} a {formatarData(b.fim)}
      </h2>
      {b.metricas.win?.aproximacao ? (
        <p className="bt-aviso-aproximacao" role="note">
          <TriangleAlert size={16} aria-hidden="true" /> {TEXTO_APROXIMACAO}
        </p>
      ) : null}
      <Veredito b={b} />
      <KpisBacktest b={b} />
      <GraficosBacktest b={b} />
      {b.metricas.win ? <ImpostoWin b={b} w={b.metricas.win} /> : null}
      <ValidacaoBacktest b={b} />
      <Tentativas b={b} />
      <Premissas b={b} />
      <p className="simulacao__aviso">
        Resultado passado, mesmo simulado com taxas, deslizamento e limites, não garante resultado futuro. O
        mercado real tem atrasos, ordens recusadas e escorregões que o backtest não captura por inteiro. Nada
        aqui é recomendação de investimento.
        {b.metricas.win ? " Day trade de mini índice pode perder mais que a margem depositada." : ""}
      </p>
    </section>
  );
}
