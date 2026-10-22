import type { DecisaoDTO, NomeCenario } from "@zentrade/contratos/esquemas";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  MessageSquareWarning,
  Star,
  type LucideIcon,
} from "lucide-react";
import { formatarPercentual, formatarPorcento } from "../../lib/formatar";
import { explicarDecisao } from "../../lib/porque";
import { Selo } from "../Selo";
import "../cenario/cenario.css";

const FUTURO: Record<NomeCenario, { rotulo: string; extenso: string; icone: LucideIcon }> = {
  alta: { rotulo: "Alta", extenso: "futuro de alta", icone: ArrowUpRight },
  lateral: { rotulo: "Lateral", extenso: "futuro lateral", icone: ArrowRight },
  baixa: { rotulo: "Baixa", extenso: "futuro de baixa", icone: ArrowDownRight },
};

/**
 * Os três futuros que o Claude pesou, lado a lado, e o que cada um teve a ver com a
 * decisão: qual favoreceu a entrada e por que os outros não decidiram. O texto sai do
 * valor esperado, do limiar e do veredito que o CÓDIGO guardou — nada é reinterpretado.
 */
export function Futuros({ decisao }: { readonly decisao: DecisaoDTO }) {
  const e = explicarDecisao(decisao);
  const proposta = decisao.proposta;
  if (!e || !proposta) return null;
  return (
    <div className="pensamento">
      <div className={`veredito veredito--${e.veredito.tom}`}>
        <p className="veredito__titulo">{e.veredito.titulo}</p>
        <p>{e.veredito.motivo}</p>
      </div>
      {e.futuros.length > 0 ? (
        <ul className="futuros" role="list" aria-label="Os três futuros que o Claude pesou">
          {e.futuros.map(({ cenario: c, papel, texto }) => {
            const f = FUTURO[c.nome];
            const Icone = f.icone;
            return (
              <li
                key={c.nome}
                className={`futuro futuro--${c.nome} ${papel === "decisivo" ? "futuro--decisivo" : ""}`}
              >
                <div className="futuro__topo">
                  <h4 className="futuro__nome">
                    <Icone size={16} aria-hidden="true" />
                    {f.rotulo}
                  </h4>
                  {papel === "decisivo" ? (
                    <Selo tom="marca" icone={Star}>
                      Favoreceu a entrada
                    </Selo>
                  ) : null}
                </div>
                <p className="futuro__chance" aria-label={`Probabilidade do ${f.extenso}`}>
                  {formatarPercentual(c.probabilidade, { casas: 0 })}
                  <span className="apagado"> de chance</span>
                </p>
                <dl>
                  <div>
                    <dt>Resultado estimado (líquido)</dt>
                    <dd className="num">
                      {formatarPorcento(c.resultadoEstimado, { casas: 2, sinal: true })}
                    </dd>
                  </div>
                  <div>
                    <dt>Horizonte</dt>
                    <dd>
                      até <span className="num">{c.horizonte}</span>{" "}
                      {c.horizonte === 1 ? "candle" : "candles"}
                    </dd>
                  </div>
                  <div>
                    <dt>Confirma se</dt>
                    <dd>{c.gatilho}</dd>
                  </div>
                  <div>
                    <dt>Perde a validade se</dt>
                    <dd>{c.invalidacao}</dd>
                  </div>
                </dl>
                <p className="futuro__porque">{texto}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
      {proposta.avaliacao ? (
        <p className="por-dentro__nota por-dentro__nota--apagada">
          Valor esperado = soma de probabilidade × resultado dos três futuros ={" "}
          <strong className="num">
            {formatarPorcento(proposta.avaliacao.valorEsperado, { casas: 2, sinal: true })}
          </strong>
          , calculado pelo código (não pela IA), em % do preço e já sem as taxas. A entrada pede pelo menos{" "}
          <span className="num">{formatarPercentual(proposta.avaliacao.limiar, { casas: 0 })}</span> de chance
          no futuro favorável.
        </p>
      ) : null}
      {proposta.contraArgumento ? (
        <div className="cenarios__contra">
          <h4 className="cenarios__contra-titulo">
            <MessageSquareWarning size={16} aria-hidden="true" />
            Principal argumento contra
          </h4>
          <p>{proposta.contraArgumento}</p>
        </div>
      ) : null}
    </div>
  );
}
