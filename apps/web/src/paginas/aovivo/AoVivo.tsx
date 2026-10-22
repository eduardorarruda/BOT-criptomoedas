import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useMemo } from "react";
import type { RegistroAoVivo } from "../../api/esquemas";
import { Cabecalho } from "../../componentes/Cabecalho";
import { ProximoPasso } from "../../componentes/ProximoPasso";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Segmentado } from "../../componentes/Segmentado";
import { useAoVivo, useDecisoes, usePosicoes, useRobos } from "../../ganchos/consultas";
import { lojaAoVivo } from "../../ganchos/lojas";
import { useAgora } from "../../ganchos/useAgora";
import { juntarRegistros, mapaDecisoes, roboDoEvento } from "../../lib/aovivo/eventos";
import { useLoja } from "../../lib/loja";
import { AnuncioAoVivo } from "./AnuncioAoVivo";
import { PainelCenarios } from "../../componentes/cenario/PainelCenarios";
import { EstadoConexao } from "./EstadoConexao";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { PainelPensando } from "./PainelPensando";
import { PensamentoDoRobo } from "./PensamentoDoRobo";
import { PainelRobo } from "./PainelRobo";
import { ResumoRobos } from "./ResumoRobos";

const TODOS = "todos";
const SEM_DECISOES: readonly DecisaoDTO[] = [];

/** Histórico da API + o que chegou ao vivo, sem repetir, e de que robô é cada um. */
function useRegistros(roboId: string | undefined) {
  const historico = useAoVivo(roboId);
  const vivos = useLoja(lojaAoVivo, (s) => s);
  const decisoes = useDecisoes({ limite: 200 }).data ?? SEM_DECISOES;
  return useMemo(() => {
    const todos = juntarRegistros(historico.data ?? [], vivos);
    const roboDaDecisao = mapaDecisoes(todos, decisoes);
    const roboDe = (r: RegistroAoVivo) => roboDoEvento(r.evento, roboDaDecisao);
    const doRobo = roboId ? todos.filter((r) => roboDe(r) === roboId) : todos.filter((r) => roboDe(r));
    return { historico, registros: doRobo, roboDe };
  }, [historico, vivos, decisoes, roboId]);
}

function ultimosPorRobo(
  registros: readonly RegistroAoVivo[],
  roboDe: (r: RegistroAoVivo) => string | undefined,
) {
  const m = new Map<string, RegistroAoVivo>();
  for (const r of registros) {
    const id = roboDe(r);
    if (id && r.evento.tipo !== "candle") m.set(id, r);
  }
  return m;
}

type Registros = ReturnType<typeof useRegistros>;

function Todos(
  p: { readonly robos: readonly RoboDTO[]; readonly escolher: (id: string) => void } & Registros,
) {
  const posicoes = usePosicoes(p.robos.map((r) => r.id));
  const agora = useAgora(5000);
  const mapa = new Map(
    posicoes.flatMap((q, i) => (q.data && p.robos[i] ? [[p.robos[i].id, q.data] as const] : [])),
  );
  return (
    <section className="aovivo-grade aovivo-grade--todos" aria-label="Todos os robôs">
      <div className="aovivo-area-resumo">
        <PainelCenarios />
      </div>
      <div className="aovivo-area-resumo">
        <ResumoRobos
          robos={p.robos}
          posicoes={mapa}
          ultimos={ultimosPorRobo(p.registros, p.roboDe)}
          agora={agora}
          escolher={p.escolher}
        />
      </div>
      <div className="aovivo-coluna">
        <div className="aovivo-area-linha">
          <Linha {...p} roboId={undefined} />
        </div>
      </div>
      <div className="aovivo-coluna">
        <div className="aovivo-area-pensando">
          <PainelPensando robos={p.robos} roboId={undefined} />
        </div>
      </div>
      <AnuncioAoVivo registros={p.registros} />
    </section>
  );
}

function Linha(p: { readonly robos: readonly RoboDTO[]; readonly roboId: string | undefined } & Registros) {
  return (
    <LinhaDoTempo
      registros={p.registros}
      robos={p.robos}
      mostrarRobo={!p.roboId}
      carregando={p.historico.isPending}
      erro={p.historico.error}
      tentarDeNovo={() => void p.historico.refetch()}
      roboDe={p.roboDe}
    />
  );
}

export function AoVivo() {
  const robos = useRobos();
  const { robo: pedido } = useSearch({ strict: false });
  const navegar = useNavigate();
  const lista = robos.data ?? [];
  const escolhido = lista.find((r) => r.id === pedido);
  const registros = useRegistros(escolhido?.id);
  const escolher = (valor: string): void =>
    void navegar({ to: "/aovivo", search: valor === TODOS ? {} : { robo: valor }, replace: true });

  return (
    <>
      <Cabecalho titulo="Ao vivo" acoes={<EstadoConexao />}>
        Tudo o que o robô faz, na hora em que faz: o candle que fecha, o sinal da regra, o que a IA consulta,
        o que o risco barra, a ordem e a posição.
      </Cabecalho>
      {robos.isPending ? <Esqueleto forma="cartoes" quantidade={4} rotulo="Carregando os robôs" /> : null}
      {robos.error ? <ErroCarregar erro={robos.error} tentarDeNovo={() => void robos.refetch()} /> : null}
      {robos.data && lista.length === 0 ? (
        <EstadoVazio icone={Bot} titulo="Nenhum robô para acompanhar" acao={<ProximoPasso />}>
          Crie um robô (ele nasce só observando, sem enviar ordem) e volte aqui para ver cada passo dele.
        </EstadoVazio>
      ) : null}
      {lista.length > 0 ? (
        <>
          <div className="barra-filtros aovivo-escolha">
            <Segmentado
              rotulo="Robô"
              opcoes={[
                { valor: TODOS, rotulo: "Todos" },
                ...lista.map((r) => ({ valor: r.id, rotulo: r.nome })),
              ]}
              valor={escolhido?.id ?? TODOS}
              aoMudar={escolher}
            />
          </div>
          {escolhido ? (
            <>
              <PainelRobo
                robo={escolhido}
                registros={registros.registros}
                linha={<Linha robos={lista} roboId={escolhido.id} {...registros} />}
                pensando={<PainelPensando robos={lista} roboId={escolhido.id} />}
                pensamento={<PensamentoDoRobo robo={escolhido} />}
              />
              <AnuncioAoVivo registros={registros.registros} />
            </>
          ) : (
            <Todos robos={lista} escolher={escolher} {...registros} />
          )}
        </>
      ) : null}
    </>
  );
}
