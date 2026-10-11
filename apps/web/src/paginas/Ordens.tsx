import type { DecisaoDTO, OrdemDTO, PosicaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { ArrowLeftRight, CircleCheck, Coins, Receipt, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { CartaoKpi, GradeKpi } from "../componentes/Kpi";
import {
  BarraFiltros,
  contarPor,
  descreverPeriodo,
  FiltroChips,
  filtrarCom,
  FiltroOpcao,
  lerLista,
  paginar,
  Paginacao,
  SeletorOrdem,
  SeletorPeriodo,
  SemResultados,
  useFiltrosUrl,
  VisoesSalvas,
  type Grupo,
} from "../componentes/filtros";
import { PrecoAoVivo } from "../componentes/PrecoAoVivo";
import { Selo } from "../componentes/Selo";
import { useDecisoes, useOrdens, usePosicoes, useRobos } from "../ganchos/consultas";
import { lojaPrecos } from "../ganchos/lojas";
import { useAgora } from "../ganchos/useAgora";
import { formatarDinheiro, formatarPreco, formatarQuantidade } from "../lib/formatar";
import { useLoja } from "../lib/loja";
import { naoRealizado, precoMedioExecucoes, taxaTotal, temQuantidade } from "../lib/posicao";
import { ESTADO_ORDEM } from "../lib/rotulos";
import { formatarDataHora } from "../lib/tempo";
import "./decisoes/decisoes.css";
import {
  agruparOrdens,
  buscaOrdens,
  ESTADOS_ORDEM,
  LADOS,
  ordenarOrdens,
  predicadosOrdens,
  resumirOrdens,
  roboDaOrdem,
  type BuscaOrdens,
} from "./ordens/filtros";

function LinhaPosicao({
  posicao: p,
  robo,
}: {
  readonly posicao: PosicaoDTO;
  readonly robo: RoboDTO | undefined;
}) {
  const atual = useLoja(lojaPrecos, (s) => s[p.simbolo]?.preco);
  const aberta = temQuantidade(p.quantidade);
  return (
    <tr>
      <th scope="row">{robo?.nome ?? p.roboId}</th>
      <td>{p.simbolo}</td>
      <td className="tabela__num num">
        {aberta ? formatarQuantidade(p.quantidade) : <span className="apagado">zerada</span>}
      </td>
      <td className="tabela__num num">{aberta ? formatarPreco(p.precoMedio) : "—"}</td>
      <td className="tabela__num">{aberta ? <PrecoAoVivo simbolo={p.simbolo} /> : "—"}</td>
      <td className="tabela__num">
        {aberta && atual ? (
          <Dinheiro valor={naoRealizado(p.quantidade, p.precoMedio, atual)} sinal colorir />
        ) : (
          "—"
        )}
      </td>
      <td className="tabela__num">
        <Dinheiro valor={p.resultadoRealizado} sinal colorir />
      </td>
      <td className="tabela__num">
        <Dinheiro valor={p.taxasPagas} className={temQuantidade(p.taxasPagas) ? "perda" : "apagado"} />
      </td>
    </tr>
  );
}

function Posicoes({
  robos,
  simbolos,
  filtrado,
}: {
  readonly robos: readonly RoboDTO[];
  readonly simbolos: readonly string[];
  readonly filtrado: boolean;
}) {
  const consultas = usePosicoes(robos.map((r) => r.id));
  const carregando = consultas.some((c) => c.isPending);
  const erro = consultas.find((c) => c.error);
  const posicoes = consultas
    .flatMap((c) => (c.data ? [c.data] : []))
    .filter((p) => simbolos.length === 0 || simbolos.includes(p.simbolo));
  if (carregando) return <Esqueleto linhas={4} rotulo="Carregando posições" />;
  if (erro?.error) return <ErroCarregar erro={erro.error} tentarDeNovo={() => void erro.refetch()} />;
  if (posicoes.length === 0)
    return (
      <EstadoVazio icone={Wallet} titulo={filtrado ? "Nenhuma posição com esses filtros" : "Nenhuma posição"}>
        A posição de cada robô é calculada a partir das execuções confirmadas pela corretora.
      </EstadoVazio>
    );
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <caption className="so-leitor">Posição de cada robô, derivada das execuções</caption>
        <thead>
          <tr>
            <th scope="col">Robô</th>
            <th scope="col">Par</th>
            <th scope="col" className="tabela__num">
              Quantidade
            </th>
            <th scope="col" className="tabela__num">
              Preço médio
            </th>
            <th scope="col" className="tabela__num">
              Preço agora
            </th>
            <th scope="col" className="tabela__num">
              Não realizado
            </th>
            <th scope="col" className="tabela__num">
              Realizado (líquido)
            </th>
            <th scope="col" className="tabela__num">
              Taxas pagas
            </th>
          </tr>
        </thead>
        <tbody>
          {posicoes.map((p) => (
            <LinhaPosicao key={p.roboId} posicao={p} robo={robos.find((r) => r.id === p.roboId)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLUNAS_ORDEM = 8;
const POR_PAGINA = 25;

function LinhaOrdem({ ordem: o, robo }: { readonly ordem: OrdemDTO; readonly robo: RoboDTO | undefined }) {
  const estado = ESTADO_ORDEM[o.estado];
  const medio = precoMedioExecucoes(o.execucoes);
  return (
    <tr>
      <td className="num">{formatarDataHora(o.criadaEm)}</td>
      <td>{robo?.nome ?? "—"}</td>
      <td>{o.simbolo}</td>
      <td>
        <span className={o.lado === "COMPRA" ? "diario-compra" : "diario-venda"}>
          {o.lado === "COMPRA" ? "Compra" : "Venda"}
        </span>
      </td>
      <td className="tabela__num num">{formatarQuantidade(o.quantidade)}</td>
      <td className="tabela__num num">{medio ? formatarPreco(medio) : "—"}</td>
      <td className="tabela__num num perda">
        {o.execucoes.length ? formatarDinheiro(taxaTotal(o.execucoes), { casas: 4 }) : "—"}
      </td>
      <td>
        <Selo tom={estado.tom} icone={estado.icone}>
          {estado.texto}
        </Selo>
        {o.motivo ? <p className="tabela__motivo">{o.motivo}</p> : null}
      </td>
    </tr>
  );
}

function TabelaOrdens({
  grupos,
  robos,
  decisoes,
}: {
  readonly grupos: readonly Grupo<OrdemDTO>[];
  readonly robos: readonly RoboDTO[];
  readonly decisoes: readonly DecisaoDTO[];
}) {
  return (
    <div
      className="tabela-rolagem tabela-rolagem--alta"
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label="Ordens filtradas (role para os lados)"
    >
      <table className="tabela tabela--zebra diario-tabela">
        <caption className="so-leitor">Ordens enviadas à corretora, com execução, taxa e estado</caption>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Robô</th>
            <th scope="col">Par</th>
            <th scope="col">Lado</th>
            <th scope="col" className="tabela__num">
              Quantidade
            </th>
            <th scope="col" className="tabela__num">
              Preço executado
            </th>
            <th scope="col" className="tabela__num">
              Taxa
            </th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.chave}>
            {g.titulo ? (
              <tr className="diario-tabela__grupo">
                <th scope="rowgroup" colSpan={COLUNAS_ORDEM}>
                  {g.titulo} <span className="diario-grupo__conta num">{g.itens.length}</span>
                </th>
              </tr>
            ) : null}
            {g.itens.map((o) => (
              <LinhaOrdem key={o.id} ordem={o} robo={roboDaOrdem(o, { robos, decisoes })} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function TotaisOrdens({ ordens }: { readonly ordens: readonly OrdemDTO[] }) {
  const r = resumirOrdens(ordens);
  return (
    <GradeKpi rotulo="Totais das ordens filtradas" colunas={4}>
      <CartaoKpi rotulo="Ordens" icone={ArrowLeftRight} valor={<span className="num">{r.total}</span>} />
      <CartaoKpi
        rotulo="Preenchidas"
        icone={CircleCheck}
        valor={<span className="num">{r.preenchidas}</span>}
        nota={r.rejeitadas > 0 ? `${r.rejeitadas} rejeitada(s) pela corretora` : undefined}
        tom={r.rejeitadas > 0 ? "atencao" : "neutro"}
      />
      <CartaoKpi rotulo="Valor executado" icone={Coins} valor={<Dinheiro valor={r.valor} />} />
      <CartaoKpi
        rotulo="Taxas pagas"
        icone={Receipt}
        valor={<Dinheiro valor={r.taxas} casas={4} className="perda" />}
      />
    </GradeKpi>
  );
}

function useFacetasOrdens(
  ordens: readonly OrdemDTO[],
  b: BuscaOrdens,
  ctx: Parameters<typeof predicadosOrdens>[1],
) {
  return useMemo(() => {
    const predicados = predicadosOrdens(b, ctx);
    const contar = <K,>(faceta: string, chave: (o: OrdemDTO) => K) =>
      contarPor(filtrarCom(ordens, predicados, faceta), chave);
    const porRobo = contar("robo", (o) => roboDaOrdem(o, ctx)?.id ?? "");
    const porSimbolo = contar("simbolo", (o) => o.simbolo);
    const porLado = contar("lado", (o) => o.lado);
    const porEstado = contar("estado", (o) => o.estado);
    const robosComOrdem = new Set(ordens.map((o) => roboDaOrdem(o, ctx)?.id));
    const estados = new Set(ordens.map((o) => o.estado));
    return {
      robos: ctx.robos
        .filter((r) => robosComOrdem.has(r.id))
        .map((r) => ({ valor: r.id, rotulo: r.nome, contagem: porRobo.get(r.id) ?? 0 })),
      simbolos: [...new Set(ordens.map((o) => o.simbolo))]
        .sort()
        .map((s) => ({ valor: s, rotulo: s, contagem: porSimbolo.get(s) ?? 0 })),
      lados: LADOS.map((l) => ({
        valor: l,
        rotulo: l === "COMPRA" ? "Compra" : "Venda",
        contagem: porLado.get(l) ?? 0,
      })),
      estados: ESTADOS_ORDEM.filter((e) => estados.has(e)).map((e) => ({
        valor: e,
        rotulo: ESTADO_ORDEM[e].texto,
        contagem: porEstado.get(e) ?? 0,
      })),
      filtradas: filtrarCom(ordens, predicados),
    };
  }, [ordens, b, ctx]);
}

const ORDENACOES = [
  { valor: "data", rotulo: "Data", direcao: "desc" },
  { valor: "valor", rotulo: "Valor executado", direcao: "desc" },
  { valor: "taxa", rotulo: "Taxa", direcao: "desc" },
] as const;

const AGRUPAR = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "robo", rotulo: "Robô" },
] as const;

export function Ordens() {
  const { busca: b, mudar, limpar, aplicar, ativos } = useFiltrosUrl(buscaOrdens);
  const robosQ = useRobos();
  const robos = useMemo(() => robosQ.data ?? [], [robosQ.data]);
  const ordensQ = useOrdens();
  const decisoesQ = useDecisoes({ limite: 200 });
  const decisoes = useMemo(() => decisoesQ.data ?? [], [decisoesQ.data]);
  const agora = useAgora(60_000);
  const ctx = useMemo(() => ({ robos, decisoes, agora }), [robos, decisoes, agora]);
  const todas = useMemo(() => ordensQ.data ?? [], [ordensQ.data]);
  const f = useFacetasOrdens(todas, b, ctx);
  const pagina = paginar(ordenarOrdens(f.filtradas, b), b.pagina ?? 1, POR_PAGINA);
  const grupos = agruparOrdens(pagina.itens, b, ctx);
  const lista = (v: string | undefined) => (v ? v.split(",") : []);
  const robosEscolhidos = lista(b.robo);
  const robosDasPosicoes = robosEscolhidos.length
    ? robos.filter((r) => robosEscolhidos.includes(r.id))
    : robos;

  return (
    <>
      <Cabecalho titulo="Ordens e posições">
        O que foi para a corretora, o que foi executado e quanto custou em taxas.
      </Cabecalho>
      <BarraFiltros
        rotulo="Filtros das ordens"
        busca={{
          valor: b.q,
          aoMudar: (q) => mudar({ q }, { substituir: true }),
          rotulo: "Buscar nas ordens",
          sugestao: "Buscar por par, robô, motivo da corretora…",
        }}
        ativos={ativos}
        aoLimpar={limpar}
        resumo={
          ordensQ.data ? (
            <>
              <span className="num">{f.filtradas.length}</span> de <span className="num">{todas.length}</span>{" "}
              ordens · {descreverPeriodo(b)}
            </>
          ) : null
        }
        extra={<VisoesSalvas tela="ordens" buscaAtual={b} aoAplicar={aplicar} />}
        ferramentas={
          <SeletorOrdem
            opcoes={ORDENACOES}
            valor={b.ordem ?? "data"}
            direcao={b.dir ?? "desc"}
            aoMudar={(ordem, dir) =>
              mudar({ ordem: ordem === "data" ? undefined : ordem, dir: dir === "desc" ? undefined : dir })
            }
          />
        }
        maisAtivos={[b.lado, b.simbolo, b.agrupar].filter(Boolean).length}
        maisFiltros={
          <>
            <FiltroChips
              rotulo="Par"
              opcoes={f.simbolos}
              selecionados={lista(b.simbolo)}
              aoMudar={(v) => mudar({ simbolo: v.join(",") || undefined })}
            />
            <FiltroChips
              rotulo="Lado"
              opcoes={f.lados}
              selecionados={lerLista(b.lado, LADOS)}
              aoMudar={(v) => mudar({ lado: v.join(",") || undefined })}
            />
            <FiltroOpcao
              rotulo="Agrupar por"
              rotuloTodos="Sem grupos"
              opcoes={AGRUPAR}
              valor={b.agrupar === "nenhum" ? undefined : b.agrupar}
              aoMudar={(agrupar) => mudar({ agrupar })}
            />
          </>
        }
      >
        <SeletorPeriodo valor={b} aoMudar={(p) => mudar(p)} />
        <FiltroChips
          rotulo="Robô"
          opcoes={f.robos}
          selecionados={robosEscolhidos}
          aoMudar={(v) => mudar({ robo: v.join(",") || undefined })}
        />
        <FiltroChips
          rotulo="Estado"
          opcoes={f.estados}
          selecionados={lerLista(b.estado, ESTADOS_ORDEM)}
          aoMudar={(v) => mudar({ estado: v.join(",") || undefined })}
        />
      </BarraFiltros>
      <Painel titulo="Posições" id="titulo-posicoes">
        {robosQ.isPending ? (
          <Esqueleto linhas={3} />
        ) : (
          <Posicoes
            robos={robosDasPosicoes}
            simbolos={lista(b.simbolo)}
            filtrado={robosEscolhidos.length > 0 || Boolean(b.simbolo)}
          />
        )}
      </Painel>
      <Painel titulo="Ordens" id="titulo-ordens">
        {ordensQ.isPending ? <Esqueleto forma="lista" quantidade={5} rotulo="Carregando ordens" /> : null}
        {ordensQ.error ? (
          <ErroCarregar erro={ordensQ.error} tentarDeNovo={() => void ordensQ.refetch()} />
        ) : null}
        {ordensQ.data?.length === 0 ? (
          <EstadoVazio icone={ArrowLeftRight} titulo="Nenhuma ordem ainda">
            Ordens aparecem quando um robô no modo Automático decide, ou quando você aprova uma sugestão.
          </EstadoVazio>
        ) : null}
        {todas.length > 0 && f.filtradas.length === 0 ? <SemResultados aoLimpar={limpar} /> : null}
        {f.filtradas.length > 0 ? (
          <div className="pilha">
            <TotaisOrdens ordens={f.filtradas} />
            <TabelaOrdens grupos={grupos} robos={robos} decisoes={decisoes} />
            <Paginacao
              pagina={pagina.pagina}
              paginas={pagina.paginas}
              total={pagina.total}
              porPagina={POR_PAGINA}
              aoMudar={(p) => mudar({ pagina: p > 1 ? p : undefined })}
              rotulo="Páginas de ordens"
            />
          </div>
        ) : null}
      </Painel>
    </>
  );
}
