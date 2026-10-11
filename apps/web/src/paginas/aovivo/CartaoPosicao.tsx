import type { PosicaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { Wallet } from "lucide-react";
import { Painel } from "../../componentes/Cabecalho";
import { Dinheiro } from "../../componentes/Dinheiro";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { PrecoAoVivo } from "../../componentes/PrecoAoVivo";
import type { LinhasProtecao } from "../../lib/aovivo/protecao";
import { formatarPercentual, formatarPreco, formatarQuantidade, sinalDe } from "../../lib/formatar";
import { distancia, naoRealizado, temQuantidade, variacao } from "../../lib/posicao";

interface Props {
  readonly robo: RoboDTO;
  readonly posicao: { readonly data?: PosicaoDTO; readonly error: unknown; readonly refetch: () => unknown };
  readonly preco: string | null;
  readonly protecao: LinhasProtecao | null;
}

const ativo = (simbolo: string): string => simbolo.replace(/USDT$/, "");

function Nivel({
  rotulo,
  nivel,
  preco,
}: {
  readonly rotulo: string;
  readonly nivel: string;
  readonly preco: string | null;
}) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd className="num">
        {formatarPreco(nivel)}
        {preco ? (
          <span className="apagado aovivo-posicao__distancia">
            {" "}
            ({formatarPercentual(distancia(preco, nivel), { sinal: true, casas: 2 })})
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** Posição aberta com o resultado não realizado contando a cada preço novo. */
export function CartaoPosicao({ robo, posicao, preco, protecao }: Props) {
  const p = posicao.data;
  return (
    <Painel titulo="Posição" id="titulo-posicao" className="aovivo-posicao">
      {posicao.error ? (
        <ErroCarregar compacto erro={posicao.error} tentarDeNovo={() => void posicao.refetch()} />
      ) : null}
      {!p && !posicao.error ? <Esqueleto forma="lista" linhas={2} rotulo="Carregando a posição" /> : null}
      {p && !temQuantidade(p.quantidade) ? <SemPosicao posicao={p} /> : null}
      {p && temQuantidade(p.quantidade) ? (
        <Aberta posicao={p} simbolo={robo.simbolo} preco={preco} protecao={protecao} />
      ) : null}
    </Painel>
  );
}

function SemPosicao({ posicao }: { readonly posicao: PosicaoDTO }) {
  return (
    <div className="aovivo-posicao__vazia">
      <Wallet size={20} strokeWidth={1.6} aria-hidden="true" className="apagado" />
      <p>
        <strong>Sem posição aberta.</strong> O robô está esperando o próximo sinal.
      </p>
      <p className="apagado">
        Realizado até aqui <Dinheiro valor={posicao.resultadoRealizado} sinal colorir /> · taxas pagas{" "}
        <Dinheiro valor={posicao.taxasPagas} />
      </p>
    </div>
  );
}

function Aberta(props: {
  readonly posicao: PosicaoDTO;
  readonly simbolo: string;
  readonly preco: string | null;
  readonly protecao: LinhasProtecao | null;
}) {
  const { posicao: p, simbolo, preco, protecao } = props;
  const resultado = preco ? naoRealizado(p.quantidade, p.precoMedio, preco) : null;
  const tom = resultado ? sinalDe(resultado) : "neutro";
  return (
    <>
      <div className="aovivo-posicao__resultado">
        <p className="apagado">Resultado não realizado</p>
        <p className={`aovivo-posicao__valor ${tom === "neutro" ? "" : tom}`}>
          {resultado ? <Dinheiro valor={resultado} sinal colorir animar /> : <span className="num">—</span>}
          {preco ? (
            <NumeroAnimado
              valor={variacao(p.precoMedio, preco)}
              formatar={(t) => formatarPercentual(t, { sinal: true, casas: 2 })}
              className="aovivo-posicao__pct"
            />
          ) : null}
        </p>
        <p className="aovivo-posicao__nota">Antes da taxa da venda; o realizado sai das execuções.</p>
      </div>
      <dl className="aovivo-posicao__dados">
        <div>
          <dt>Quantidade</dt>
          <dd className="num">
            {formatarQuantidade(p.quantidade)} {ativo(simbolo)}
          </dd>
        </div>
        <div>
          <dt>Preço médio</dt>
          <dd className="num">{formatarPreco(p.precoMedio)}</dd>
        </div>
        <div>
          <dt>Preço agora</dt>
          <dd>
            <PrecoAoVivo simbolo={simbolo} {...(preco ? { reserva: preco } : {})} />
          </dd>
        </div>
        {protecao ? <Nivel rotulo="Stop" nivel={protecao.stop} preco={preco} /> : null}
        {protecao ? <Nivel rotulo="Alvo" nivel={protecao.alvo} preco={preco} /> : null}
        <div>
          <dt>Realizado · taxas</dt>
          <dd>
            <Dinheiro valor={p.resultadoRealizado} sinal colorir /> · <Dinheiro valor={p.taxasPagas} />
          </dd>
        </div>
      </dl>
    </>
  );
}
