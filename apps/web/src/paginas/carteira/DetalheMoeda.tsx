import type {
  MoedaCarteira,
  NegociacaoCarteira,
  ParcelaCarteira,
  RedeConta,
} from "@zentrade/contratos/esquemas";
import { Bot, Hand, TriangleAlert } from "lucide-react";
import { Dialogo } from "../../componentes/Dialogo";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { formatarDinheiro, formatarPreco, formatarQuantidade } from "../../lib/formatar";
import { formatarDataHora } from "../../lib/tempo";
import { useCarteiraAtivo } from "./ganchos";
import { Numero } from "./Numero";

const PARCELAS = [
  ["total", "Total"],
  ["robo", "Robô"],
  ["manual", "Manual"],
] as const;

const LINHAS: readonly [
  string,
  (p: ParcelaCarteira) => string | null,
  "quantidade" | "preco" | "dinheiro" | "resultado" | "percentual",
][] = [
  ["Quantidade em posição", (p) => p.quantidade, "quantidade"],
  ["Preço médio", (p) => p.precoMedio, "preco"],
  ["Custo da posição", (p) => p.custoPosicao, "dinheiro"],
  ["Valor atual", (p) => p.valorAtual, "dinheiro"],
  ["Não realizado", (p) => p.resultadoNaoRealizado, "resultado"],
  ["Realizado bruto", (p) => p.resultadoRealizadoBruto, "resultado"],
  ["Taxas", (p) => p.taxas, "dinheiro"],
  ["Realizado líquido", (p) => p.resultadoRealizadoLiquido, "resultado"],
  ["Resultado líquido", (p) => p.resultadoLiquido, "resultado"],
  ["Retorno", (p) => p.retorno, "percentual"],
  ["Comprado (custo)", (p) => p.custoComprado, "dinheiro"],
  ["Vendido (recebido)", (p) => p.valorVendido, "dinheiro"],
];

function Parcelas({ moeda }: { readonly moeda: MoedaCarteira }) {
  return (
    <table className="tabela carteira-parcelas">
      <caption className="so-leitor">Números da moeda por parcela, em USDT</caption>
      <thead>
        <tr>
          <td />
          {PARCELAS.map(([, rotulo]) => (
            <th key={rotulo} scope="col" className="tabela__num">
              {rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {LINHAS.map(([rotulo, ler, formato]) => (
          <tr key={rotulo}>
            <th scope="row">{rotulo}</th>
            {PARCELAS.map(([chave]) => (
              <td key={chave} className="tabela__num">
                <Numero valor={ler(moeda[chave])} formato={formato} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Negociacoes({ negociacoes }: { readonly negociacoes: readonly NegociacaoCarteira[] }) {
  if (negociacoes.length === 0)
    return (
      <p className="apagado">
        Nenhuma negociação importada desta moeda. O saldo veio de depósito ou transferência.
      </p>
    );
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
    <div className="tabela-rolagem" tabIndex={0} role="region" aria-label="Negociações da moeda">
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Par</th>
            <th scope="col">Lado</th>
            <th scope="col">Origem</th>
            <th scope="col" className="tabela__num">
              Quantidade
            </th>
            <th scope="col" className="tabela__num">
              Preço
            </th>
            <th scope="col" className="tabela__num">
              Taxa
            </th>
            <th scope="col" className="tabela__num">
              Taxa em USDT
            </th>
          </tr>
        </thead>
        <tbody>
          {negociacoes.map((n) => (
            <tr key={n.id}>
              <td className="num">{formatarDataHora(n.em)}</td>
              <td>{n.simbolo}</td>
              <td className={n.lado === "COMPRA" ? "ganho" : "perda"}>
                {n.lado === "COMPRA" ? "Compra" : "Venda"}
              </td>
              <td>
                <Selo tom={n.origem === "robo" ? "marca" : "neutro"} icone={n.origem === "robo" ? Bot : Hand}>
                  {n.origem === "robo" ? "Robô" : "Manual"}
                </Selo>
              </td>
              <td className="tabela__num num">{formatarQuantidade(n.quantidade)}</td>
              <td className="tabela__num num">
                {formatarPreco(n.preco)} <span className="apagado">{n.cotacao}</span>
              </td>
              <td className="tabela__num num">
                {formatarQuantidade(n.taxa)} <span className="apagado">{n.ativoTaxa}</span>
              </td>
              <td className="tabela__num">
                {n.taxaUsdt === null ? (
                  <span className="apagado" title="sem preço para converter no instante">
                    sem conversão
                  </span>
                ) : (
                  <span className="num">{formatarDinheiro(n.taxaUsdt, { casas: 4 })}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tudo de uma moeda: números por parcela, avisos e as negociações, da mais recente à mais antiga. */
export function DetalheMoeda({
  ativo,
  rede,
  aoFechar,
}: {
  readonly ativo: string | null;
  readonly rede: RedeConta | undefined;
  readonly aoFechar: () => void;
}) {
  const consulta = useCarteiraAtivo(ativo, rede);
  const d = consulta.data;
  return (
    <Dialogo
      aberto={ativo !== null}
      aoFechar={aoFechar}
      titulo={ativo ?? ""}
      largo
      descricao="Valores em USDT. Robô e manual têm cada um o próprio preço médio."
    >
      {consulta.isPending ? <Esqueleto linhas={6} /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {d ? (
        <div className="pilha">
          <p className="carteira-conta">
            Saldo <span className="num">{formatarQuantidade(d.moeda.saldo.total)}</span>
            {d.moeda.preco ? (
              <>
                {" "}
                a <span className="num">{formatarPreco(d.moeda.preco)}</span> USDT
              </>
            ) : null}
          </p>
          {d.moeda.avisos.map((a) => (
            <p key={a} className="faixa faixa--atencao">
              <TriangleAlert size={16} aria-hidden="true" /> {a}
            </p>
          ))}
          {d.moeda.referencia ? (
            <p className="apagado">USDT é a moeda de referência: é caixa, sem preço médio nem resultado.</p>
          ) : (
            <Parcelas moeda={d.moeda} />
          )}
          <h3 className="painel__titulo">Negociações</h3>
          <Negociacoes negociacoes={d.negociacoes} />
        </div>
      ) : null}
    </Dialogo>
  );
}
