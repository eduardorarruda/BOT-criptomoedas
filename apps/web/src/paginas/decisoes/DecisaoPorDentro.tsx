import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Brain,
  CalendarClock,
  Compass,
  Flag,
  ListChecks,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Cabecalho } from "../../componentes/Cabecalho";
import { ListaCondicoes } from "../../componentes/cenario/ListaCondicoes";
import { NumerosDoCenario, ReguaDaMedia, SeloCenario } from "../../componentes/cenario/Cenario";
import { Numeros, Resposta, Risco } from "../../componentes/decisao/CartaoDecisao";
import { Futuros } from "../../componentes/decisao/Futuros";
import { Proposta } from "../../componentes/decisao/Proposta";
import { Dinheiro } from "../../componentes/Dinheiro";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { useDecisao, useRobos } from "../../ganchos/consultas";
import { formatarPercentual } from "../../lib/formatar";
import { ACAO, ESTADO_DECISAO, MODO_ROBO, REDE } from "../../lib/rotulos";
import { formatarDataHora, formatarRelativo } from "../../lib/tempo";
import "../../componentes/cenario/cenario.css";

function Secao({
  numero,
  titulo,
  icone: Icone,
  children,
}: {
  readonly numero: number;
  readonly titulo: string;
  readonly icone: LucideIcon;
  readonly children: ReactNode;
}) {
  const id = `por-dentro-${numero}`;
  return (
    <section className="por-dentro__secao" aria-labelledby={id}>
      <h2 id={id}>
        <span className="por-dentro__passo" aria-hidden="true">
          {numero}
        </span>
        <Icone size={18} aria-hidden="true" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Quando({ d, robo }: { readonly d: DecisaoDTO; readonly robo: RoboDTO | undefined }) {
  const estado = ESTADO_DECISAO[d.estado];
  return (
    <Secao numero={1} titulo="Quando" icone={CalendarClock}>
      <p className="por-dentro__nota">
        A vela fechou em{" "}
        <time dateTime={new Date(d.em).toISOString()}>
          <strong>{formatarDataHora(d.em)}</strong>
        </time>{" "}
        <span className="apagado">({formatarRelativo(d.em)}, no fuso da instância)</span>, e foi nesse
        instante que {robo ? <strong>{robo.nome}</strong> : "o robô"} decidiu.
      </p>
      <div className="pensamento__meta">
        <Selo tom={estado.tom} icone={estado.icone}>
          {estado.texto}
        </Selo>
        {robo ? (
          <>
            <Selo tom="neutro">
              {robo.simbolo} · velas de {robo.intervalo}
            </Selo>
            <Selo tom="neutro" icone={MODO_ROBO[robo.modo].icone}>
              {MODO_ROBO[robo.modo].texto}
            </Selo>
            <Selo tom={REDE[robo.rede].tom}>{REDE[robo.rede].texto}</Selo>
          </>
        ) : null}
      </div>
      <Numeros decisao={d} />
    </Secao>
  );
}

function OQueARegraViu({ d }: { readonly d: DecisaoDTO }) {
  return (
    <Secao numero={2} titulo="O que a regra viu" icone={ListChecks}>
      <p className="por-dentro__nota">
        A estratégia deu <strong>{ACAO[d.sinal.acao]}</strong>. O motivo, nas palavras dela:
      </p>
      <p className="decisao__explicacao">{d.sinal.explicacao}</p>
      {d.condicoes ? (
        <ListaCondicoes condicoes={d.condicoes} rotulo="Condições da regra naquele momento" />
      ) : (
        <p className="por-dentro__nota por-dentro__nota--apagada">
          {d.regime
            ? "Esta saída veio do stop, do alvo ou do tempo máximo, que valem sem passar pelas condições da regra."
            : "Esta decisão é anterior ao registro condição por condição; a explicação acima é o que ficou guardado."}
        </p>
      )}
    </Secao>
  );
}

function CenarioDaEpoca({ d }: { readonly d: DecisaoDTO }) {
  return (
    <Secao numero={3} titulo="Cenário de mercado naquele momento" icone={Compass}>
      {d.regime ? (
        <>
          <div className="pensamento__meta">
            <SeloCenario cenario={d.regime.cenario} />
          </div>
          <p className="por-dentro__nota">{d.regime.texto}</p>
          <ReguaDaMedia leitura={d.regime} />
          <NumerosDoCenario leitura={d.regime} />
        </>
      ) : (
        <p className="por-dentro__nota por-dentro__nota--apagada">
          O cenário de mercado só passou a ser guardado junto da decisão depois desta; não há leitura para
          mostrar.
        </p>
      )}
    </Secao>
  );
}

function OQueOClaudePensou({ d, robo }: { readonly d: DecisaoDTO; readonly robo: RoboDTO | undefined }) {
  const desligado = robo?.limites.agente === "desligado";
  const p = d.proposta;
  return (
    <Secao numero={4} titulo="O que o Claude pensou" icone={Brain}>
      {!p && desligado ? (
        <p className="por-dentro__aviso">
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <strong>O Claude estava desligado neste robô.</strong> Nenhuma consulta de IA foi feita (custo
            zero): só a regra da estratégia e o motor de risco decidiram.
          </span>
        </p>
      ) : null}
      {!p && !desligado ? (
        <p className="por-dentro__aviso">
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <strong>O Claude não analisou esta decisão.</strong>{" "}
            {d.sinal.acao === "VENDER"
              ? "Stop e alvo valem sem consultar a IA: a posição precisa ficar protegida."
              : "Ela foi barrada antes da consulta (por exemplo, robô pausado) ou o agente não respondeu."}
          </span>
        </p>
      ) : null}
      {p ? (
        <>
          <p className="por-dentro__nota">
            O Claude propôs{" "}
            <strong>{{ comprar: "comprar", vender: "vender", aguardar: "aguardar" }[p.acao]}</strong> com{" "}
            <span className="num">{formatarPercentual(p.confianca, { casas: 0 })}</span> de confiança
            {d.custoIaUsd ? <> (custo da análise: US$ {d.custoIaUsd})</> : null}.
          </p>
          <Proposta proposta={p} />
          <Futuros decisao={d} />
          {p.vetoGrave ? (
            <p className="por-dentro__aviso">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>
                <strong>Veto grave:</strong> {p.vetoGrave}
              </span>
            </p>
          ) : null}
        </>
      ) : null}
    </Secao>
  );
}

function Resultado({ d }: { readonly d: DecisaoDTO }) {
  const a = d.avaliacao;
  return (
    <Secao numero={6} titulo="Resultado" icone={Flag}>
      {d.desfecho ? (
        <p className="por-dentro__nota">
          A ida e volta fechou com <Dinheiro valor={d.desfecho.resultado} sinal colorir />, líquido das taxas
          (avaliado em {formatarDataHora(d.desfecho.avaliadoEm)}).
        </p>
      ) : (
        <p className="por-dentro__nota por-dentro__nota--apagada">
          Ainda sem desfecho: o resultado aparece quando a posição aberta por esta decisão fechar.
        </p>
      )}
      {a ? (
        <p className="por-dentro__nota">
          Placar do Claude: ele <strong>{a.claude === "aprovou" ? "aprovou" : "vetou"}</strong> esta entrada
          com <span className="num">{formatarPercentual(a.confianca, { casas: 0 })}</span> de confiança.{" "}
          {a.situacao === "pendente" ? (
            "Ainda é cedo para dizer se acertou."
          ) : (
            <>
              {a.fonte === "real" ? "Com a posição real" : "Simulando a entrada nas velas seguintes"}
              {a.resultado ? (
                <>
                  , o resultado foi <Dinheiro valor={a.resultado} sinal colorir />
                </>
              ) : null}
              : <strong>{a.acertou ? "o Claude acertou" : "o Claude errou"}</strong>.
            </>
          )}
        </p>
      ) : (
        <p className="por-dentro__nota por-dentro__nota--apagada">
          Esta decisão não entrou no placar do Claude (só entradas que passaram por ele entram).
        </p>
      )}
    </Secao>
  );
}

function Corpo({ d, robo }: { readonly d: DecisaoDTO; readonly robo: RoboDTO | undefined }) {
  return (
    <div className="por-dentro">
      <Quando d={d} robo={robo} />
      <OQueARegraViu d={d} />
      <CenarioDaEpoca d={d} />
      <OQueOClaudePensou d={d} robo={robo} />
      <Secao numero={5} titulo="Risco" icone={ShieldCheck}>
        <Risco decisao={d} />
      </Secao>
      <Resultado d={d} />
      {d.estado === "aguardando_aprovacao" ? <Resposta decisao={d} /> : null}
    </div>
  );
}

/** `/decisoes/:id`: a decisão contada de ponta a ponta, na ordem em que aconteceu. */
export function DecisaoPorDentro() {
  const { id } = useParams({ strict: false });
  const decisao = useDecisao(id ?? "");
  const robos = useRobos().data;
  const d = decisao.data;
  const robo = robos?.find((r) => r.id === d?.roboId);
  return (
    <>
      <Cabecalho
        titulo={d ? `${ACAO[d.sinal.acao]} por dentro` : "Decisão por dentro"}
        acoes={
          <Link to="/decisoes" className="botao botao--secundario botao--pequeno">
            <ArrowLeft size={14} aria-hidden="true" /> Todas as decisões
          </Link>
        }
      >
        Por que o robô decidiu isso, quando, o que a regra e o Claude enxergaram e o que aconteceu depois.
      </Cabecalho>
      {decisao.isPending ? <Esqueleto forma="cartoes" quantidade={3} rotulo="Carregando a decisão" /> : null}
      {decisao.error ? (
        <ErroCarregar erro={decisao.error} tentarDeNovo={() => void decisao.refetch()} />
      ) : null}
      {d ? <Corpo d={d} robo={robo} /> : null}
    </>
  );
}
