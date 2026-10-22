import type { LeituraCenarioDTO } from "@zentrade/contratos/esquemas";
import { CENARIO, numerosDoCenario, pct, posicaoNaRegua, type NomeDoCenario } from "../../lib/cenario";
import { Selo } from "../Selo";
import "./cenario.css";

/** Alta, queda ou lateral: ícone + palavra + cor (a cor nunca é a única pista). */
export function SeloCenario({ cenario }: { readonly cenario: NomeDoCenario }) {
  const c = CENARIO[cenario];
  return (
    <Selo tom={c.tom} icone={c.icone}>
      {c.rotulo}
    </Selo>
  );
}

/**
 * Onde a média de 200 velas está indo: o centro é "parada"; as pontas são queda e alta. As
 * zonas começam no limiar que o domínio usou, então a bolinha cai na zona do cenário.
 */
export function ReguaDaMedia({ leitura }: { readonly leitura: LeituraCenarioDTO }) {
  const posicao = posicaoNaRegua(leitura.inclinacaoSma200, leitura.limiarInclinacao);
  if (posicao === null) return null;
  return (
    <div
      className="regua"
      role="img"
      aria-label={`Inclinação da média de 200 velas: ${pct(leitura.inclinacaoSma200)} em 50 velas. Vira tendência acima de ${pct(leitura.limiarInclinacao, false)}.`}
    >
      <div className="regua__trilho" aria-hidden="true">
        <span className="regua__zona--queda" />
        <span className="regua__zona--lateral" />
        <span className="regua__zona--alta" />
        <span className="regua__ponto" style={{ left: `${posicao}%` }} />
      </div>
      <div className="regua__rotulos" aria-hidden="true">
        <span>Queda</span>
        <span>Lateral</span>
        <span>Alta</span>
      </div>
    </div>
  );
}

/** Os números que justificam o cenário, com o que cada um quer dizer em `title`. */
export function NumerosDoCenario({ leitura }: { readonly leitura: LeituraCenarioDTO }) {
  const numeros = numerosDoCenario(leitura);
  if (numeros.length === 0) return null;
  return (
    <dl className="numeros-cenario">
      {numeros.map((n) => (
        <div key={n.chave} title={n.ajuda}>
          <dt>{n.rotulo}</dt>
          <dd>{n.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Como o cenário é decidido e o que cada número quer dizer (texto fixo, curto). */
export function ComoLerOCenario() {
  return (
    <details className="cenarios-como-ler">
      <summary>Como o cenário é decidido</summary>
      <dl>
        <div>
          <dt>Alta</dt>
          <dd>
            O preço está acima da média das últimas 200 velas e essa média sobe mais que o limiar nas últimas
            50 velas.
          </dd>
        </div>
        <div>
          <dt>Queda</dt>
          <dd>O espelho: preço abaixo da média de 200 e a média caindo mais que o limiar.</dd>
        </div>
        <div>
          <dt>Lateral</dt>
          <dd>O resto: preço colado na média, média parada, ou preço e média discordando.</dd>
        </div>
        <div>
          <dt>Limiar</dt>
          <dd>
            Meio ATR (o quanto o preço costuma andar por vela). Assim vale em qualquer ativo e intervalo. Só
            candles já fechados entram na conta: nada do futuro.
          </dd>
        </div>
        <div>
          <dt>Sem leitura</dt>
          <dd>Menos de 250 velas de histórico: o robô não chuta, espera completar.</dd>
        </div>
      </dl>
    </details>
  );
}
