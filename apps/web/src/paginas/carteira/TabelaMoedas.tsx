import type { MoedaCarteira, ResumoCarteira } from "@zentrade/contratos/esquemas";
import { ArrowDown, ArrowUp, ArrowUpDown, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { formatarDinheiro, formatarQuantidade } from "../../lib/formatar";
import { Numero } from "./Numero";
import {
  alternarOrdem,
  COLUNAS,
  ORDEM_PADRAO,
  ordenarMoedas,
  totalDaColuna,
  valorDaColuna,
  type Coluna,
  type DefinicaoColuna,
  type Ordem,
  type Parcela,
} from "./tabela";

const POR_QUE_VAZIO: Partial<Record<Coluna, string>> = {
  precoMedio: "sem posição ou custo desconhecido",
  preco: "sem preço em USDT na Binance",
  valorAtual: "sem preço atual",
  naoRealizado: "sem preço atual",
  retorno: "sem compra conhecida ou sem preço",
  alocacao: "sem preço em USDT",
};

function Cabecalho({
  c,
  ordem,
  aoOrdenar,
}: {
  c: DefinicaoColuna;
  ordem: Ordem;
  aoOrdenar: (c: Coluna) => void;
}) {
  const ativa = ordem.coluna === c.chave;
  const Icone = !ativa ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
  const sort = ativa ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={sort} className={c.formato === "texto" ? "" : "tabela__num"}>
      <button type="button" className="carteira-ordenar" onClick={() => aoOrdenar(c.chave)} title={c.dica}>
        {c.rotulo}
        <Icone size={12} aria-hidden="true" className={ativa ? "" : "apagado"} />
      </button>
    </th>
  );
}

/** Comprado e vendido mostram quantidade e valor juntos: são dois números da mesma conta. */
function Celula({ m, parcela, c }: { m: MoedaCarteira; parcela: Parcela; c: DefinicaoColuna }) {
  const p = m[parcela];
  if (c.chave === "comprado" || c.chave === "vendido") {
    if (m.referencia) return <td className="tabela__num apagado">—</td>;
    const [q, v] =
      c.chave === "comprado"
        ? [p.quantidadeComprada, p.custoComprado]
        : [p.quantidadeVendida, p.valorVendido];
    return (
      <td className="tabela__num">
        <span className="num">{formatarDinheiro(v)}</span>
        <span className="carteira-sub num">{formatarQuantidade(q)}</span>
      </td>
    );
  }
  return (
    <td className="tabela__num">
      <Numero
        valor={valorDaColuna(m, parcela, c.chave)}
        formato={c.formato}
        porQueVazio={POR_QUE_VAZIO[c.chave] ?? "não se aplica"}
      />
    </td>
  );
}

function Linha({
  m,
  parcela,
  aoAbrir,
}: {
  m: MoedaCarteira;
  parcela: Parcela;
  aoAbrir: (ativo: string) => void;
}) {
  return (
    <tr className="carteira-linha">
      <th scope="row">
        <button type="button" className="carteira-moeda" onClick={() => aoAbrir(m.ativo)}>
          {m.ativo}
          {m.referencia ? <span className="apagado carteira-sub">caixa</span> : null}
          {m.avisos.length > 0 ? (
            <TriangleAlert size={13} className="atencao" aria-label={`${m.avisos.length} aviso(s)`} />
          ) : null}
        </button>
      </th>
      {COLUNAS.slice(1).map((c) => (
        <Celula key={c.chave} m={m} parcela={parcela} c={c} />
      ))}
    </tr>
  );
}

/** Tabela por moeda com todas as colunas do cálculo; ordenável e com a linha de totais. */
export function TabelaMoedas({
  moedas,
  resumo,
  parcela,
  aoAbrir,
}: {
  readonly moedas: readonly MoedaCarteira[];
  readonly resumo: ResumoCarteira;
  readonly parcela: Parcela;
  readonly aoAbrir: (ativo: string) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const ordenadas = useMemo(() => ordenarMoedas(moedas, parcela, ordem), [moedas, parcela, ordem]);
  return (
    <div
      className="tabela-rolagem"
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label="Moedas da carteira (role para os lados)"
    >
      <table className="tabela carteira-tabela">
        <caption className="so-leitor">
          Carteira por moeda, valores em USDT. Clique no nome de uma coluna para ordenar.
        </caption>
        <thead>
          <tr>
            {COLUNAS.map((c) => (
              <Cabecalho
                key={c.chave}
                c={c}
                ordem={ordem}
                aoOrdenar={(col) => setOrdem((o) => alternarOrdem(o, col))}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((m) => (
            <Linha key={m.ativo} m={m} parcela={parcela} aoAbrir={aoAbrir} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {COLUNAS.slice(1).map((c) => (
              <td key={c.chave} className="tabela__num">
                {c.chave === "alocacao" ? (
                  <span className="num">100%</span>
                ) : (
                  <Numero
                    valor={totalDaColuna(resumo, parcela, c.chave)}
                    formato={c.formato}
                    porQueVazio="não soma entre moedas"
                  />
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
