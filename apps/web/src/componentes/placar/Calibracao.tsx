import type { MetricasPlacarDTO } from "@zentrade/contratos/esquemas";
import { formatarNumero } from "@zentrade/dominio";
import { TabelaRolagem } from "../TabelaRolagem";
import { confianca, dinheiroDoPlacar, porcento } from "./formato";

/** Duas barras por faixa: o que o Claude disse e o que aconteceu. Decorativas: os números estão na tabela. */
function Barras({ disse, acertou }: { readonly disse: number; readonly acertou: number }) {
  return (
    <span className="placar-barras" aria-hidden="true">
      <span className="placar-barras__trilho">
        <span className="placar-barras__disse" style={{ width: `${Math.round(disse * 100)}%` }} />
      </span>
      <span className="placar-barras__trilho">
        <span className="placar-barras__acertou" style={{ width: `${Math.round(acertou * 100)}%` }} />
      </span>
    </span>
  );
}

/**
 * Calibração: em cada faixa de confiança, a confiança média que o Claude disse e o
 * acerto que aconteceu. Bem calibrado, as duas barras ficam do mesmo tamanho.
 */
export function Calibracao({ metricas }: { readonly metricas: MetricasPlacarDTO }) {
  const faixas = metricas.calibracao.faixas.filter((f) => f.decisoes > 0);
  if (faixas.length === 0) return null;
  const brier = metricas.calibracao.brier;
  return (
    <section className="placar-bloco" aria-labelledby="titulo-calibracao">
      <h3 id="titulo-calibracao" className="placar-bloco__titulo">
        A confiança bate com o resultado?
      </h3>
      <p className="placar-bloco__texto">
        Quando o Claude diz 70% de confiança, ele deveria acertar perto de 70% das vezes.
        {brier !== null ? (
          <>
            {" "}
            Brier score: <strong className="num">{formatarNumero(Math.round(brier * 1000) / 1000)}</strong> (0
            é perfeito; 0,25 é o mesmo que dizer sempre 50%).
          </>
        ) : null}
      </p>
      <p className="placar-legenda" aria-hidden="true">
        <span className="placar-legenda__item">
          <span className="placar-legenda__cor placar-legenda__cor--disse" /> Confiança dita
        </span>
        <span className="placar-legenda__item">
          <span className="placar-legenda__cor placar-legenda__cor--acertou" /> Acerto observado
        </span>
      </p>
      <TabelaRolagem rotulo="Calibração por faixa de confiança (role para os lados)">
        <table className="tabela tabela--compacta placar-tabela">
          <caption className="so-leitor">
            Calibração: por faixa de confiança, quantas decisões, a confiança média dita e o acerto observado.
          </caption>
          <thead>
            <tr>
              <th scope="col">Faixa de confiança</th>
              <th scope="col" className="num">
                Decisões
              </th>
              <th scope="col" className="num">
                Disse
              </th>
              <th scope="col" className="num">
                Acertou
              </th>
              <th scope="col">
                <span className="so-leitor">Comparação visual</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {faixas.map((f) => (
              <tr key={f.de}>
                <th scope="row">
                  {confianca(f.de)} a {confianca(f.ate)}
                </th>
                <td className="num">{f.decisoes}</td>
                <td className="num">{porcento(f.confiancaMedia)}</td>
                <td className="num">{porcento(f.acerto)}</td>
                <td>
                  <Barras disse={f.confiancaMedia ?? 0} acertou={f.acerto ?? 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolagem>
    </section>
  );
}

/** "Se só valessem as aprovações com confiança ≥ X": a tabela inteira, para quem quiser conferir a sugestão. */
export function TabelaLimites({ metricas }: { readonly metricas: MetricasPlacarDTO }) {
  const linhas = metricas.limites.filter((l) => l.aprovacoes > 0);
  if (linhas.length === 0) return null;
  return (
    <details className="placar-detalhes">
      <summary>Ver a conta de cada limite de confiança</summary>
      <TabelaRolagem rotulo="Resultado por limite de confiança (role para os lados)">
        <table className="tabela tabela--compacta placar-tabela">
          <caption className="so-leitor">
            Se só valessem as aprovações com confiança igual ou acima do limite: quantas, a precisão e o
            resultado.
          </caption>
          <thead>
            <tr>
              <th scope="col">Confiança mínima</th>
              <th scope="col" className="num">
                Aprovações
              </th>
              <th scope="col" className="num">
                Precisão
              </th>
              <th scope="col" className="num">
                Resultado
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.limite} aria-current={metricas.limite?.limite === l.limite ? "true" : undefined}>
                <th scope="row">≥ {confianca(l.limite)}</th>
                <td className="num">{l.aprovacoes}</td>
                <td className="num">{porcento(l.precisao)}</td>
                <td className="num">
                  {l.resultado !== null
                    ? dinheiroDoPlacar(metricas, l.resultado, true)
                    : `${porcento(l.retorno)} somados`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolagem>
    </details>
  );
}
