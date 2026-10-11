import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { CartaoDecisao } from "../../componentes/decisao/CartaoDecisao";
import { Dinheiro } from "../../componentes/Dinheiro";
import { Selo } from "../../componentes/Selo";
import { formatarCustoIa, formatarPreco, formatarQuantidade } from "../../lib/formatar";
import { ACAO, ESTADO_DECISAO } from "../../lib/rotulos";
import { formatarDataHora } from "../../lib/tempo";
import { valorDe } from "./filtros";

const COLUNAS = 9;

/** O diário em linhas: para comparar muitas decisões de uma vez. Cada linha abre o cartão inteiro. */
export function TabelaDecisoes({
  decisoes,
  robos,
  rotulo,
  compacta = false,
}: {
  readonly decisoes: readonly DecisaoDTO[];
  readonly robos: readonly RoboDTO[];
  readonly rotulo: string;
  readonly compacta?: boolean;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <div
      className="tabela-rolagem tabela-rolagem--alta"
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label={`${rotulo} (role para os lados)`}
    >
      <table className={`tabela tabela--zebra diario-tabela ${compacta ? "tabela--compacta" : ""}`}>
        <caption className="so-leitor">{rotulo}. Abra uma linha para ver o raciocínio completo.</caption>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Robô</th>
            <th scope="col">Ação</th>
            <th scope="col">Estado</th>
            <th scope="col" className="tabela__num">
              Preço
            </th>
            <th scope="col" className="tabela__num">
              Quantidade
            </th>
            <th scope="col" className="tabela__num">
              Valor
            </th>
            <th scope="col" className="tabela__num">
              Desfecho
            </th>
            <th scope="col" className="tabela__num">
              Custo de IA
            </th>
          </tr>
        </thead>
        <tbody>
          {decisoes.map((d) => {
            const robo = robos.find((r) => r.id === d.roboId);
            const estado = ESTADO_DECISAO[d.estado];
            const valor = valorDe(d);
            const expandida = aberta === d.id;
            return (
              <Fragment key={d.id}>
                <tr className={expandida ? "diario-tabela__linha--aberta" : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="diario-tabela__abrir"
                      aria-expanded={expandida}
                      aria-controls={`decisao-${d.id}`}
                      onClick={() => setAberta(expandida ? null : d.id)}
                    >
                      {expandida ? (
                        <ChevronDown size={14} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={14} aria-hidden="true" />
                      )}
                      <span className="num">{formatarDataHora(d.em)}</span>
                    </button>
                  </th>
                  <td>
                    {robo?.nome ?? "Robô removido"}
                    <span className="diario-tabela__sub">{robo?.simbolo ?? "—"}</span>
                  </td>
                  <td>
                    <span className={d.sinal.acao === "VENDER" ? "diario-venda" : "diario-compra"}>
                      {ACAO[d.sinal.acao]}
                    </span>
                  </td>
                  <td>
                    <Selo tom={estado.tom} icone={estado.icone}>
                      {estado.texto}
                    </Selo>
                  </td>
                  <td className="tabela__num num">{formatarPreco(d.preco)}</td>
                  <td className="tabela__num num">{d.quantidade ? formatarQuantidade(d.quantidade) : "—"}</td>
                  <td className="tabela__num">
                    {valor === null ? "—" : <Dinheiro valor={valor.toFixed(2)} />}
                  </td>
                  <td className="tabela__num">
                    {d.desfecho ? (
                      <Dinheiro valor={d.desfecho.resultado} sinal colorir />
                    ) : (
                      <span className="apagado">—</span>
                    )}
                  </td>
                  <td className="tabela__num num">{d.custoIaUsd ? formatarCustoIa(d.custoIaUsd) : "—"}</td>
                </tr>
                {expandida ? (
                  <tr id={`decisao-${d.id}`} className="diario-tabela__detalhe">
                    <td colSpan={COLUNAS}>
                      <CartaoDecisao decisao={d} robo={robo} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
