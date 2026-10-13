import type { MoedaCarteira } from "@zentrade/contratos/esquemas";
import { TriangleAlert } from "lucide-react";
import { Dinheiro } from "../../componentes/Dinheiro";
import {
  formatarDinheiro,
  formatarPercentual,
  formatarPreco,
  formatarQuantidade,
  sinalDe,
} from "../../lib/formatar";
import { ordenarMoedas, type Ordem, type Parcela } from "./tabela";

/** Uma moeda por cartão: o que se lê de relance (valor, fatia, resultado) e o caminho para o detalhe. */
function Cartao({
  m,
  parcela,
  aoAbrir,
}: {
  readonly m: MoedaCarteira;
  readonly parcela: Parcela;
  readonly aoAbrir: (ativo: string) => void;
}) {
  const p = m[parcela];
  const fatia = m.alocacao === null ? null : Math.min(100, Number(m.alocacao) * 100);
  return (
    <li>
      <button
        type="button"
        className="carteira-cartao"
        onClick={() => aoAbrir(m.ativo)}
        aria-label={`${m.ativo}: ver detalhes`}
      >
        <span className="carteira-cartao__topo">
          <span className="carteira-cartao__ativo">{m.ativo}</span>
          {m.referencia ? <span className="apagado">caixa</span> : null}
          {m.avisos.length > 0 ? (
            <TriangleAlert size={14} className="atencao" aria-label={`${m.avisos.length} aviso(s)`} />
          ) : null}
          <span className="carteira-cartao__preco num apagado">
            {m.preco ? formatarPreco(m.preco) : "sem preço"}
          </span>
        </span>
        <span className="carteira-cartao__valor num">
          {m.valorSaldo === null ? "—" : formatarDinheiro(m.valorSaldo)}
        </span>
        <span className="carteira-cartao__barra" aria-hidden="true">
          <span style={{ width: `${fatia ?? 0}%` }} />
        </span>
        <span className="carteira-cartao__dados">
          <span>
            <span className="apagado">Fatia</span>
            <span className="num">{m.alocacao === null ? "—" : formatarPercentual(m.alocacao)}</span>
          </span>
          <span>
            <span className="apagado">Saldo</span>{" "}
            <span className="num">{formatarQuantidade(m.saldo.total)}</span>
          </span>
          {m.referencia ? null : (
            <>
              <span>
                <span className="apagado">Resultado</span>
                {p.resultadoLiquido === null ? (
                  <span className="apagado">—</span>
                ) : (
                  <Dinheiro valor={p.resultadoLiquido} sinal colorir />
                )}
              </span>
              <span>
                <span className="apagado">Retorno</span>
                <span className={`num ${p.retorno ? sinalDe(p.retorno) : ""}`}>
                  {p.retorno === null ? "—" : formatarPercentual(p.retorno, { casas: 2, sinal: true })}
                </span>
              </span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}

export function CartoesMoedas({
  moedas,
  parcela,
  ordem,
  aoAbrir,
}: {
  readonly moedas: readonly MoedaCarteira[];
  readonly parcela: Parcela;
  readonly ordem: Ordem;
  readonly aoAbrir: (ativo: string) => void;
}) {
  return (
    <ul role="list" className="carteira-cartoes" aria-label="Moedas da carteira">
      {ordenarMoedas(moedas, parcela, ordem).map((m) => (
        <Cartao key={m.ativo} m={m} parcela={parcela} aoAbrir={aoAbrir} />
      ))}
    </ul>
  );
}
