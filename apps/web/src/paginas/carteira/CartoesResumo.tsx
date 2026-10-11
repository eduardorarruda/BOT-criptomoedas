import type { ResumoCarteira } from "@zentrade/contratos/esquemas";
import { Dinheiro } from "../../componentes/Dinheiro";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { formatarDinheiro, formatarPercentual, sinalDe } from "../../lib/formatar";
import type { Parcela } from "./tabela";

const dinheiro = (t: string): string => formatarDinheiro(t);

/** Os números de bater o olho: quanto está investido, quanto vale, quanto rendeu e quanto foi de taxa. */
export function CartoesResumo({
  resumo,
  parcela,
  recorte = null,
}: {
  readonly resumo: ResumoCarteira;
  readonly parcela: Parcela;
  /** Quantas moedas o filtro deixou: os cartões somam só elas. null = a conta inteira. */
  readonly recorte?: number | null;
}) {
  const r = resumo[parcela];
  return (
    <>
      <dl className="metricas carteira-metricas">
        <div className="metrica metrica--destaque">
          <dt>Resultado líquido</dt>
          <dd>
            <Dinheiro valor={r.resultadoLiquido} sinal colorir animar />
          </dd>
          <dd className="metrica__nota">
            realizado − taxas + não realizado
            {r.retorno !== null ? (
              <>
                {" · "}
                <span className={`num ${sinalDe(r.retorno)}`}>
                  {formatarPercentual(r.retorno, { casas: 2, sinal: true })}
                </span>{" "}
                sobre o total comprado
              </>
            ) : null}
          </dd>
        </div>
        <div className="metrica">
          <dt>Total investido</dt>
          <dd>
            <NumeroAnimado valor={r.custoPosicao} formatar={dinheiro} />
          </dd>
          <dd className="metrica__nota">custo das posições abertas</dd>
        </div>
        <div className="metrica">
          <dt>Valor atual</dt>
          <dd>
            <NumeroAnimado valor={r.valorAtual} formatar={dinheiro} />
          </dd>
          <dd className="metrica__nota">dessas posições, a preço de mercado</dd>
        </div>
        <div className="metrica">
          <dt>Resultado bruto</dt>
          <dd>
            <Dinheiro valor={r.resultadoBruto} sinal colorir />
          </dd>
          <dd className="metrica__nota">antes das taxas</dd>
        </div>
        <div className="metrica">
          <dt>Taxas pagas</dt>
          <dd>
            <NumeroAnimado valor={r.taxas} formatar={dinheiro} />
          </dd>
          <dd className="metrica__nota">convertidas para USDT no instante</dd>
        </div>
      </dl>
      {recorte !== null ? (
        <p className="carteira-recorte" role="status">
          Somando só {recorte === 1 ? "a moeda filtrada" : `as ${recorte} moedas filtradas`} (sem o caixa em
          USDT).
        </p>
      ) : null}
      <p className="carteira-conta">
        Valor da conta <span className="num">{formatarDinheiro(resumo.valorConta)}</span>
        <span aria-hidden="true"> · </span>
        caixa em USDT <span className="num">{formatarDinheiro(resumo.caixa)}</span>
        <span aria-hidden="true"> · </span>
        sem custo conhecido <span className="num">{formatarDinheiro(resumo.valorSemCusto)}</span>
      </p>
    </>
  );
}
