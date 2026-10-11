import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, OctagonX, ScrollText } from "lucide-react";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { AnalisesAoVivo } from "../componentes/decisao/AnalisesAoVivo";
import { CartaoDecisao } from "../componentes/decisao/CartaoDecisao";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { GraficoLinha } from "../componentes/graficos/GraficoLinha";
import { NumeroAnimado } from "../componentes/NumeroAnimado";
import { PrecoAoVivo } from "../componentes/PrecoAoVivo";
import { Selo } from "../componentes/Selo";
import { useDecisoes, usePatrimonio, useResumo, useRobos } from "../ganchos/consultas";
import { formatarCustoIa, formatarDinheiro } from "../lib/formatar";
import { variacao } from "../lib/metricas";
import { MODO_ROBO, REDE } from "../lib/rotulos";

function Metricas() {
  const { data: r, error, refetch, isPending } = useResumo();
  if (isPending) return <Esqueleto altura={92} rotulo="Carregando o resumo do dia" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} />;
  const queda = r.maiorQueda30d.startsWith("-") ? r.maiorQueda30d : `-${r.maiorQueda30d}`;
  return (
    <>
      {r.paradaTotal ? (
        <div className="faixa faixa--atencao" role="status">
          <OctagonX size={18} aria-hidden="true" />
          <p>
            <strong>Parada total ligada.</strong> Nenhum robô envia ordens até você desligar.
          </p>
          <Link to="/risco" className="botao botao--secundario botao--pequeno">
            Ir para Risco
          </Link>
        </div>
      ) : null}
      <dl className="metricas">
        <div className="metrica metrica--destaque">
          <dt>Resultado do dia</dt>
          <dd>
            <Dinheiro valor={r.resultadoHoje} sinal colorir animar />
          </dd>
          <dd className="metrica__nota">inclui posições abertas pelo preço atual</dd>
        </div>
        <div className="metrica">
          <dt>Exposição</dt>
          <dd>
            <NumeroAnimado valor={r.exposicao} formatar={(t) => formatarDinheiro(t)} />
          </dd>
          <dd className="metrica__nota">em posições abertas</dd>
        </div>
        <div className="metrica">
          <dt>Maior queda</dt>
          <dd>
            <Dinheiro valor={queda} colorir />
          </dd>
          <dd className="metrica__nota">nos últimos 30 dias</dd>
        </div>
        <div className="metrica">
          <dt>Taxas hoje</dt>
          <dd>
            {r.taxasHoje ? (
              <NumeroAnimado valor={r.taxasHoje} formatar={(t) => formatarDinheiro(t)} />
            ) : (
              <span className="apagado">—</span>
            )}
          </dd>
          <dd className="metrica__nota">pagas à corretora</dd>
        </div>
        <div className="metrica">
          <dt>Custo de IA hoje</dt>
          <dd>
            <NumeroAnimado valor={r.custoIaHoje} formatar={formatarCustoIa} />
          </dd>
          <dd className="metrica__nota">análises do agente</dd>
        </div>
      </dl>
    </>
  );
}

function Curva() {
  const { data, error, refetch, isPending } = usePatrimonio();
  if (isPending) return <Esqueleto altura={260} rotulo="Carregando a curva de patrimônio" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} />;
  if (data.length < 2)
    return (
      <EstadoVazio icone={ScrollText} titulo="Ainda não há histórico">
        A curva aparece depois das primeiras operações confirmadas pela corretora.
      </EstadoVazio>
    );
  const v = variacao(data.map((p) => p.valor));
  return (
    <>
      <p className="painel__legenda">
        <span className="legenda-linha legenda-linha--real" aria-hidden="true" /> Resultado real, das
        execuções confirmadas · <Dinheiro valor={v.absoluta} sinal colorir /> em 30 dias
      </p>
      <GraficoLinha
        pontos={data}
        tipo="real"
        rotulo={`Curva de patrimônio real dos últimos 30 dias: variação de ${formatarDinheiro(v.absoluta, { sinal: true })}.`}
      />
    </>
  );
}

function Robos() {
  const { data, isPending, error, refetch } = useRobos();
  if (isPending) return <Esqueleto linhas={4} />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} compacto />;
  if (data.length === 0)
    return (
      <EstadoVazio
        icone={Bot}
        titulo="Nenhum robô ainda"
        acao={
          <Link to="/robos" className="botao botao--primario">
            Criar o primeiro robô
          </Link>
        }
      >
        Um robô segue uma estratégia num par (como BTCUSDT). Ele nasce só observando.
      </EstadoVazio>
    );
  return (
    <ul role="list" className="lista-robos">
      {data.map((r) => {
        const modo = MODO_ROBO[r.modo];
        return (
          <li
            key={r.id}
            className={r.pausado ? "lista-robos__item lista-robos__item--pausado" : "lista-robos__item"}
          >
            <span className="lista-robos__nome">{r.nome}</span>
            <span className="apagado lista-robos__simbolo">{r.simbolo}</span>
            <PrecoAoVivo simbolo={r.simbolo} />
            <span className="lista-robos__selos">
              {r.pausado ? (
                <Selo tom="neutro">Pausado</Selo>
              ) : (
                <Selo tom={r.modo === "auto" ? "marca" : "neutro"} icone={modo.icone}>
                  {modo.texto}
                </Selo>
              )}
              <Selo tom={REDE[r.rede].tom}>{REDE[r.rede].texto}</Selo>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Decisoes() {
  const robos = useRobos().data ?? [];
  const aguardando = useDecisoes({ estado: "aguardando_aprovacao" });
  const ultimas = useDecisoes({ limite: 6 });
  return (
    <div className="pilha">
      {aguardando.data?.length ? (
        <Painel titulo="Aguardando você" id="titulo-aguardando">
          <div className="pilha">
            {aguardando.data.map((d) => (
              <CartaoDecisao key={d.id} decisao={d} robo={robos.find((r) => r.id === d.roboId)} compacto />
            ))}
          </div>
        </Painel>
      ) : null}
      <AnalisesAoVivo robos={robos} />
      <Painel
        titulo="Últimas decisões"
        id="titulo-ultimas"
        semBorda
        acoes={
          <Link to="/decisoes" className="link-seta">
            Ver todas <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      >
        {ultimas.isPending ? <Esqueleto linhas={5} /> : null}
        {ultimas.error ? (
          <ErroCarregar erro={ultimas.error} tentarDeNovo={() => void ultimas.refetch()} compacto />
        ) : null}
        {ultimas.data?.length === 0 ? (
          <EstadoVazio icone={ScrollText} titulo="Nenhuma decisão ainda">
            Quando uma estratégia der sinal, a decisão aparece aqui com o porquê.
          </EstadoVazio>
        ) : null}
        <div className="pilha pilha--justa">
          {ultimas.data?.map((d) => (
            <CartaoDecisao key={d.id} decisao={d} robo={robos.find((r) => r.id === d.roboId)} compacto />
          ))}
        </div>
      </Painel>
    </div>
  );
}

export function VisaoGeral() {
  return (
    <>
      <Cabecalho titulo="Visão geral">
        Como estão seus robôs hoje — com perdas, taxas e custo de IA à vista.
      </Cabecalho>
      <Metricas />
      <div className="grade-visao">
        <div className="pilha">
          <Painel titulo="Curva de patrimônio" id="titulo-curva">
            <Curva />
          </Painel>
          <Painel
            titulo="Robôs"
            id="titulo-robos"
            acoes={
              <Link to="/robos" className="link-seta">
                Gerenciar <ArrowRight size={14} aria-hidden="true" />
              </Link>
            }
          >
            <Robos />
          </Painel>
        </div>
        <Decisoes />
      </div>
    </>
  );
}
