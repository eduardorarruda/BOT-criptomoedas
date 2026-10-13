import { Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import {
  ArrowRight,
  Bot,
  Layers,
  ChartLine,
  OctagonX,
  Receipt,
  ScrollText,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { AnalisesAoVivo } from "../componentes/decisao/AnalisesAoVivo";
import { CartaoDecisao } from "../componentes/decisao/CartaoDecisao";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { CartaoKpi, GradeKpi } from "../componentes/Kpi";
import { Minigrafico } from "../componentes/Minigrafico";
import { NumeroAnimado } from "../componentes/NumeroAnimado";
import { PrecoAoVivo } from "../componentes/PrecoAoVivo";
import { Selo } from "../componentes/Selo";
import { useDecisoes, usePatrimonio, useResumo, useRobos } from "../ganchos/consultas";
import { formatarCustoIa, formatarDinheiro, sinalDe } from "../lib/formatar";
import { variacao } from "../lib/metricas";
import { MODO_ROBO, REDE } from "../lib/rotulos";

/** O lightweight-charts (~57 kB) chega depois dos números: a curva não segura a primeira tela. */
const GraficoLinha = lazy(() =>
  import("../componentes/graficos/GraficoLinha").then((m) => ({ default: m.GraficoLinha })),
);

function Metricas() {
  const { data: r, error, refetch, isPending } = useResumo();
  const curva = usePatrimonio().data;
  if (isPending) return <Esqueleto forma="kpis" quantidade={5} rotulo="Carregando o resumo do dia" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} />;
  const queda = r.maiorQueda30d.startsWith("-") ? r.maiorQueda30d : `-${r.maiorQueda30d}`;
  const valores = curva && curva.length > 1 ? curva.map((p) => Number(p.valor)) : null;
  const mes = curva && curva.length > 1 ? variacao(curva.map((p) => p.valor)) : null;
  return (
    <>
      {r.paradaTotal ? (
        <div className="faixa faixa--atencao" role="status">
          <OctagonX size={18} aria-hidden="true" />
          <p>
            <strong>Parada total ligada.</strong> Nenhuma entrada nova até você desligar; o stop e o alvo das
            posições abertas seguem valendo.
          </p>
          <Link to="/risco" className="botao botao--secundario botao--pequeno">
            Ir para Risco
          </Link>
        </div>
      ) : null}
      <GradeKpi colunas={5} rotulo="Resumo do dia">
        <CartaoKpi
          destaque
          rotulo="Resultado do dia"
          valor={<Dinheiro valor={r.resultadoHoje} sinal colorir animar />}
          nota="inclui posições abertas pelo preço atual"
          {...(mes
            ? {
                variacao: (
                  <>
                    {formatarDinheiro(mes.absoluta, { sinal: true })}{" "}
                    <span className="apagado">em 30 dias</span>
                  </>
                ),
                tomVariacao: sinalDe(mes.absoluta),
              }
            : {})}
          grafico={valores ? <Minigrafico valores={valores} largura={240} altura={44} /> : undefined}
        />
        <CartaoKpi
          icone={Layers}
          rotulo="Exposição"
          valor={<NumeroAnimado valor={r.exposicao} formatar={(t) => formatarDinheiro(t)} />}
          nota="em posições abertas"
        />
        <CartaoKpi
          icone={TrendingDown}
          rotulo="Maior queda"
          valor={<Dinheiro valor={queda} colorir />}
          nota="nos últimos 30 dias"
        />
        <CartaoKpi
          icone={Receipt}
          rotulo="Taxas hoje"
          valor={
            r.taxasHoje ? (
              <NumeroAnimado valor={r.taxasHoje} formatar={(t) => formatarDinheiro(t)} />
            ) : (
              <span className="apagado">—</span>
            )
          }
          nota="pagas à corretora"
        />
        <CartaoKpi
          icone={Sparkles}
          rotulo="Custo de IA hoje"
          valor={<NumeroAnimado valor={r.custoIaHoje} formatar={formatarCustoIa} />}
          nota="análises do agente"
        />
      </GradeKpi>
    </>
  );
}

function Curva() {
  const { data, error, refetch, isPending } = usePatrimonio();
  if (isPending) return <Esqueleto forma="grafico" altura={260} rotulo="Carregando a curva de patrimônio" />;
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
      <Suspense fallback={<Esqueleto forma="grafico" altura={240} rotulo="Carregando o gráfico" />}>
        <GraficoLinha
          pontos={data}
          tipo="real"
          rotulo={`Curva de patrimônio real dos últimos 30 dias: variação de ${formatarDinheiro(v.absoluta, { sinal: true })}.`}
        />
      </Suspense>
    </>
  );
}

function Robos() {
  const { data, isPending, error, refetch } = useRobos();
  if (isPending) return <Esqueleto forma="lista" linhas={4} rotulo="Carregando robôs" />;
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
        {ultimas.isPending ? <Esqueleto forma="lista" linhas={5} rotulo="Carregando decisões" /> : null}
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
        Como estão seus robôs hoje, com perdas, taxas e custo de IA à vista.
      </Cabecalho>
      <Metricas />
      <div className="grade-visao">
        <div className="pilha">
          <Painel titulo="Curva de patrimônio" id="titulo-curva" icone={ChartLine} variante="destaque">
            <Curva />
          </Painel>
          <Painel
            titulo="Robôs"
            id="titulo-robos"
            icone={Bot}
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
