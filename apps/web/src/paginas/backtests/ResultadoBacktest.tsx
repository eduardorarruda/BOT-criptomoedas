import { FlaskConical } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { formatarData } from "../../lib/tempo";
import { GraficosBacktest } from "./Graficos";
import { KpisBacktest } from "./Kpis";
import { Premissas } from "./Premissas";
import { Tentativas } from "./Tentativas";
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
      <Veredito b={b} />
      <KpisBacktest b={b} />
      <GraficosBacktest b={b} />
      <ValidacaoBacktest b={b} />
      <Tentativas b={b} />
      <Premissas b={b} />
      <p className="simulacao__aviso">
        Resultado passado, mesmo simulado com taxas, deslizamento e limites, não garante resultado futuro. O
        mercado real tem atrasos, ordens recusadas e escorregões que o backtest não captura por inteiro. Nada
        aqui é recomendação de investimento.
      </p>
    </section>
  );
}
