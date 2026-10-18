import type { GrupoPlacarDTO, MetricasPlacarDTO, PlacarDTO } from "@zentrade/contratos/esquemas";
import { CircleCheck, Coins, Gauge, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import { usePlacar } from "../../ganchos/consultas";
import { formatarNumero } from "@zentrade/dominio";
import { Painel } from "../Cabecalho";
import { Dinheiro } from "../Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../Estados";
import { CartaoKpi, GradeKpi } from "../Kpi";
import { TabelaRolagem } from "../TabelaRolagem";
import { Calibracao, TabelaLimites } from "./Calibracao";
import { confianca, contagem, dinheiroDoPlacar, moedaDaTela, porcento, tomDaPrecisao } from "./formato";
import "./placar.css";

/**
 * O placar do Claude: das entradas que ele aprovou, quantas deram lucro; dos sinais
 * que ele vetou, quantos teriam dado prejuízo; em dinheiro, o que ele agregou contra
 * aprovar tudo; e se a confiança dele bate com o que acontece. Só números medidos —
 * nada aqui é recomendação de investimento.
 */
function Indicadores({ m, meta }: { readonly m: MetricasPlacarDTO; readonly meta: number }) {
  const tom = tomDaPrecisao(m.aprovacoes.taxa, meta);
  return (
    <GradeKpi rotulo="Placar do Claude" colunas={4}>
      <CartaoKpi
        destaque
        icone={Target}
        rotulo="Aprovações certas"
        valor={<span className="num">{porcento(m.aprovacoes.taxa)}</span>}
        variacao={
          m.aprovacoes.taxa === null ? undefined : tom === "ganho" ? (
            <>Acima da meta de {porcento(meta)}</>
          ) : (
            <>Abaixo da meta de {porcento(meta)}</>
          )
        }
        tomVariacao={tom === "ganho" ? "ganho" : tom === "atencao" ? "atencao" : "neutro"}
        nota={contagem(m.aprovacoes)}
        {...(tom === "atencao" ? { tom: "atencao" as const } : {})}
      />
      <CartaoKpi
        icone={ShieldCheck}
        rotulo="Vetos certos"
        valor={<span className="num">{porcento(m.vetos.taxa)}</span>}
        nota={
          m.dinheiro && m.vetos.total > 0
            ? `${contagem(m.vetos)} · evitaram ${dinheiroDoPlacar(m, m.dinheiro.perdasEvitadas)}`
            : contagem(m.vetos)
        }
      />
      <CartaoKpi
        icone={Coins}
        rotulo="O que o Claude agregou"
        valor={
          m.dinheiro ? (
            <Dinheiro valor={m.dinheiro.agregado} sinal colorir moeda={moedaDaTela(m.moeda)} />
          ) : (
            <span className="apagado">—</span>
          )
        }
        nota={
          m.dinheiro
            ? `aprovadas ${dinheiroDoPlacar(m, m.dinheiro.aprovadas, true)} · aprovar tudo ${dinheiroDoPlacar(m, m.dinheiro.seAprovasseTudo, true)}`
            : m.avaliadas > 0
              ? "moedas diferentes: veja por mercado"
              : "aparece com o primeiro desfecho"
        }
      />
      <CartaoKpi
        icone={Gauge}
        rotulo="Calibração (Brier)"
        valor={
          m.calibracao.brier === null ? (
            <span className="apagado">—</span>
          ) : (
            <span className="num">{formatarNumero(Math.round(m.calibracao.brier * 1000) / 1000)}</span>
          )
        }
        nota="0 é perfeito; 0,25 é chutar 50%"
      />
    </GradeKpi>
  );
}

/** Por que "% de acerto" sozinho engana: o payoff decide o resultado. */
function AcertoEngana({ m }: { readonly m: MetricasPlacarDTO }) {
  const p = m.payoff;
  return (
    <section className="placar-bloco" aria-labelledby="titulo-acerto-engana">
      <h3 id="titulo-acerto-engana" className="placar-bloco__titulo">
        Por que só a “% de acerto” engana
      </h3>
      <p className="placar-bloco__texto">
        Acertar muito não basta: 9 ganhos de US$ 1 e uma perda de US$ 20 dão 90% de acerto e prejuízo. O que
        decide é quanto se ganha quando acerta contra quanto se perde quando erra.
        {p && p.acertoNecessario !== null ? (
          <>
            {" "}
            Nas aprovações do Claude, o ganho médio foi{" "}
            <strong className="num">{dinheiroDoPlacar(m, p.ganhoMedio)}</strong> e a perda média{" "}
            <strong className="num">{dinheiroDoPlacar(m, p.perdaMedia)}</strong>: com isso, para empatar é
            preciso acertar <strong className="num">{porcento(p.acertoNecessario)}</strong>. O resultado médio
            por aprovação foi <strong className="num">{dinheiroDoPlacar(m, p.expectativa, true)}</strong>.
          </>
        ) : null}
      </p>
    </section>
  );
}

function LimiteSugerido({ m, meta }: { readonly m: MetricasPlacarDTO; readonly meta: number }) {
  if (m.aprovacoes.total === 0) return null;
  const l = m.limite;
  return (
    <section className="placar-bloco" aria-labelledby="titulo-limite">
      <h3 id="titulo-limite" className="placar-bloco__titulo">
        Limite de confiança
      </h3>
      {l ? (
        <p className="placar-bloco__texto">
          Se só valessem as aprovações com confiança de pelo menos{" "}
          <strong className="num">{confianca(l.limite)}</strong>, elas teriam acertado{" "}
          <strong className="num">{porcento(l.precisao)}</strong> ({l.acertos} de {l.aprovacoes}, provável
          entre {porcento(l.intervalo.inferior)} e {porcento(l.intervalo.superior)})
          {l.resultado !== null ? <>, somando {dinheiroDoPlacar(m, l.resultado, true)}</> : null}. É o limite
          de maior resultado com pelo menos {porcento(meta)} de acerto.
          {l.poucasAmostras ? " Ainda são poucos casos: trate como pista, não como regra." : null}
        </p>
      ) : (
        <p className="placar-bloco__texto">
          Nenhum limite de confiança chegou a {porcento(meta)} de acerto nas aprovações até agora.
        </p>
      )}
      <TabelaLimites metricas={m} />
    </section>
  );
}

function PorRobo({ grupos }: { readonly grupos: readonly GrupoPlacarDTO[] }) {
  if (grupos.length < 2) return null;
  return (
    <section className="placar-bloco" aria-labelledby="titulo-placar-robos">
      <h3 id="titulo-placar-robos" className="placar-bloco__titulo">
        Por robô
      </h3>
      <TabelaRolagem rotulo="Placar por robô (role para os lados)">
        <table className="tabela tabela--compacta placar-tabela">
          <caption className="so-leitor">
            Placar do Claude por robô: decisões avaliadas, aprovações certas, vetos certos e o que agregou.
          </caption>
          <thead>
            <tr>
              <th scope="col">Robô</th>
              <th scope="col" className="num">
                Avaliadas
              </th>
              <th scope="col" className="num">
                Aprovações certas
              </th>
              <th scope="col" className="num">
                Vetos certos
              </th>
              <th scope="col" className="num">
                Agregou
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.chave}>
                <th scope="row">{g.nome}</th>
                <td className="num">{g.metricas.avaliadas}</td>
                <td className="num">
                  {porcento(g.metricas.aprovacoes.taxa)}{" "}
                  <span className="apagado">
                    ({g.metricas.aprovacoes.acertos}/{g.metricas.aprovacoes.total})
                  </span>
                </td>
                <td className="num">
                  {porcento(g.metricas.vetos.taxa)}{" "}
                  <span className="apagado">
                    ({g.metricas.vetos.acertos}/{g.metricas.vetos.total})
                  </span>
                </td>
                <td className="num">
                  {g.metricas.dinheiro ? (
                    <Dinheiro
                      valor={g.metricas.dinheiro.agregado}
                      sinal
                      colorir
                      moeda={moedaDaTela(g.metricas.moeda)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolagem>
    </section>
  );
}

export function ConteudoPlacar({
  placar,
  comRobos,
}: {
  readonly placar: PlacarDTO;
  readonly comRobos: boolean;
}) {
  const m = placar.total;
  if (m.decisoes === 0)
    return (
      <EstadoVazio icone={Target} titulo="Ainda sem decisões do Claude" compacto>
        O placar começa quando um sinal da estratégia passar pelo Claude: cada aprovação e cada veto ganha um
        desfecho, real ou simulado com a mesma saída do backtest.
      </EstadoVazio>
    );
  return (
    <div className="placar-claude">
      {m.aviso ? (
        <p className="placar-aviso">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{m.aviso}</span>
        </p>
      ) : null}
      <Indicadores m={m} meta={placar.meta} />
      <p className="placar-resumo">
        <CircleCheck size={14} aria-hidden="true" /> {m.avaliadas} com desfecho
        {m.pendentes > 0 ? `, ${m.pendentes} esperando o mercado` : ""}. Aprovação certa = lucro depois das
        taxas; veto certo = a entrada vetada teria terminado no zero ou no prejuízo, com o mesmo stop, alvo,
        regra de saída e tempo da estratégia.
      </p>
      <div className="placar-grade">
        <AcertoEngana m={m} />
        <LimiteSugerido m={m} meta={placar.meta} />
      </div>
      <Calibracao metricas={m} />
      {comRobos ? <PorRobo grupos={placar.porRobo} /> : null}
      <p className="placar-nota">
        Medição do que já aconteceu, não recomendação de investimento: resultados passados não garantem os
        próximos.
      </p>
    </div>
  );
}

export function PlacarClaude({ roboId }: { readonly roboId?: string | undefined }) {
  const consulta = usePlacar(roboId ? { roboId } : {});
  return (
    <Painel
      titulo="Placar do Claude"
      id="placar"
      icone={Target}
      descricao="Como terminaram as entradas que o Claude aprovou — e as que ele vetou, pelo que teriam feito."
    >
      {consulta.isPending ? <Esqueleto forma="kpis" quantidade={4} rotulo="Carregando o placar" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} compacto />
      ) : null}
      {consulta.data ? <ConteudoPlacar placar={consulta.data} comRobos={!roboId} /> : null}
    </Painel>
  );
}
