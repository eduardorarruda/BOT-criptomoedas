import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { CircleCheck, LayoutList, Scale, ScrollText, Sparkles, Table2 } from "lucide-react";
import { useMemo } from "react";
import { Cabecalho } from "../componentes/Cabecalho";
import { AnalisesAoVivo } from "../componentes/decisao/AnalisesAoVivo";
import { CartaoDecisao } from "../componentes/decisao/CartaoDecisao";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { CartaoKpi, GradeKpi } from "../componentes/Kpi";
import {
  AlternarDensidade,
  AlternarVisao,
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
import { useDecisoes, useRobos } from "../ganchos/consultas";
import { useAgora } from "../ganchos/useAgora";
import { formatarCustoIa } from "../lib/formatar";
import { ACAO, ESTADO_DECISAO } from "../lib/rotulos";
import {
  ACOES,
  agruparDecisoes,
  buscaDecisoes,
  DESFECHOS,
  desfechoDe,
  ESTADOS,
  ordenarDecisoes,
  predicadosDecisoes,
  resumirDecisoes,
  type BuscaDecisoes,
  type Desfecho,
} from "./decisoes/filtros";
import { TabelaDecisoes } from "./decisoes/TabelaDecisoes";
import "./decisoes/decisoes.css";

/** A API devolve as mais recentes; os filtros trabalham sobre elas. */
const LIMITE_API = 200;
const POR_PAGINA = { cartoes: 20, tabela: 50 } as const;

const DESFECHO: Record<Desfecho, string> = { ganho: "Com ganho", perda: "Com perda", sem: "Sem desfecho" };

const ORDENS = [
  { valor: "data", rotulo: "Data", direcao: "desc" },
  { valor: "valor", rotulo: "Valor da ordem", direcao: "desc" },
  { valor: "resultado", rotulo: "Desfecho", direcao: "desc" },
  { valor: "custo", rotulo: "Custo de IA", direcao: "desc" },
] as const;

const AGRUPAR = [
  { valor: "robo", rotulo: "Robô" },
  { valor: "nenhum", rotulo: "Sem grupos" },
] as const;

function Totais({
  decisoes,
  periodo,
}: {
  readonly decisoes: readonly DecisaoDTO[];
  readonly periodo: string;
}) {
  const r = resumirDecisoes(decisoes);
  return (
    <GradeKpi rotulo={`Totais das decisões filtradas, ${periodo}`} colunas={4}>
      <CartaoKpi rotulo="Decisões" icone={ScrollText} valor={<span className="num">{r.total}</span>} />
      <CartaoKpi
        rotulo="Executadas"
        icone={CircleCheck}
        valor={<span className="num">{r.executadas}</span>}
      />
      <CartaoKpi
        rotulo="Desfecho avaliado"
        icone={Scale}
        valor={
          r.comDesfecho > 0 ? (
            <Dinheiro valor={r.resultado} sinal colorir />
          ) : (
            <span className="apagado">—</span>
          )
        }
        nota={r.comDesfecho === 1 ? "de 1 decisão" : `de ${r.comDesfecho} decisões`}
      />
      <CartaoKpi
        rotulo="Custo de IA"
        icone={Sparkles}
        valor={<span className="num">{formatarCustoIa(r.custoIa)}</span>}
      />
    </GradeKpi>
  );
}

function Grupos({
  grupos,
  robos,
  compacta,
}: {
  readonly grupos: readonly Grupo<DecisaoDTO>[];
  readonly robos: readonly RoboDTO[];
  readonly compacta: boolean;
}) {
  return (
    <div className="linha-do-tempo" data-densidade={compacta ? "compacta" : undefined}>
      {grupos.map((g) => (
        <section
          key={g.chave}
          className="linha-do-tempo__dia"
          aria-labelledby={g.titulo ? `grupo-${g.chave}` : undefined}
          aria-label={g.titulo ? undefined : "Decisões"}
        >
          {g.titulo ? (
            <h2 id={`grupo-${g.chave}`} className="linha-do-tempo__titulo">
              {g.titulo} <span className="diario-grupo__conta num">{g.itens.length}</span>
            </h2>
          ) : null}
          <ol role="list" className="linha-do-tempo__lista">
            {g.itens.map((d) => (
              <li key={d.id}>
                <CartaoDecisao decisao={d} robo={robos.find((r) => r.id === d.roboId)} compacto={compacta} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** As opções de cada filtro, com quantas decisões cada uma traria com os outros filtros valendo. */
function useFacetas(
  todas: readonly DecisaoDTO[],
  b: BuscaDecisoes,
  robos: readonly RoboDTO[],
  agora: number,
) {
  return useMemo(() => {
    const ctx = { robos, agora };
    const predicados = predicadosDecisoes(b, ctx);
    const contar = <K,>(faceta: string, chave: (d: DecisaoDTO) => K) =>
      contarPor(filtrarCom(todas, predicados, faceta), chave);
    const simboloDe = (d: DecisaoDTO) => robos.find((r) => r.id === d.roboId)?.simbolo ?? "";
    const presentes = <K,>(chave: (d: DecisaoDTO) => K) => new Set(todas.map(chave));
    const porRobo = contar("robo", (d) => d.roboId);
    const porSimbolo = contar("simbolo", simboloDe);
    const porAcao = contar("acao", (d) => d.sinal.acao);
    const porEstado = contar("estado", (d) => d.estado);
    const porDesfecho = contar("desfecho", desfechoDe);
    const robosComDecisao = presentes((d) => d.roboId);
    return {
      robos: robos
        .filter((r) => robosComDecisao.has(r.id))
        .map((r) => ({ valor: r.id, rotulo: r.nome, contagem: porRobo.get(r.id) ?? 0 })),
      simbolos: [...presentes(simboloDe)]
        .filter(Boolean)
        .sort()
        .map((s) => ({ valor: s, rotulo: s, contagem: porSimbolo.get(s) ?? 0 })),
      acoes: ACOES.filter((a) => presentes((d) => d.sinal.acao).has(a)).map((a) => ({
        valor: a,
        rotulo: ACAO[a],
        contagem: porAcao.get(a) ?? 0,
      })),
      estados: ESTADOS.filter((e) => presentes((d) => d.estado).has(e)).map((e) => ({
        valor: e,
        rotulo: ESTADO_DECISAO[e].texto,
        contagem: porEstado.get(e) ?? 0,
      })),
      desfechos: DESFECHOS.map((x) => ({ valor: x, rotulo: DESFECHO[x], contagem: porDesfecho.get(x) ?? 0 })),
      filtradas: filtrarCom(todas, predicados),
    };
  }, [todas, b, robos, agora]);
}

export function Decisoes() {
  const { busca: b, mudar, limpar, aplicar, ativos } = useFiltrosUrl(buscaDecisoes);
  const robos = useRobos().data ?? [];
  const consulta = useDecisoes({ limite: LIMITE_API });
  const todas = consulta.data ?? [];
  // O "agora" dos períodos anda de minuto em minuto: "últimos 7 dias" não fica parado.
  const agora = useAgora(60_000);
  const f = useFacetas(todas, b, robos, agora);
  const visao = b.visao ?? "cartoes";
  const compacta = b.densidade === "compacta";
  const ordenadas = ordenarDecisoes(f.filtradas, b);
  const porPagina = POR_PAGINA[visao];
  const pagina = paginar(ordenadas, b.pagina ?? 1, porPagina);
  const grupos = agruparDecisoes(pagina.itens, b, { robos, agora });
  const lista = (v: string | undefined) => (v ? v.split(",") : []);
  const roboUnico = lista(b.robo).length === 1 ? lista(b.robo)[0] : undefined;
  const periodo = descreverPeriodo(b);

  return (
    <>
      <Cabecalho titulo="Decisões">
        O diário dos robôs: por que o sinal disparou, o que a IA argumentou, o que o risco decidiu e como
        terminou.
      </Cabecalho>
      <BarraFiltros
        rotulo="Filtros das decisões"
        busca={{
          valor: b.q,
          aoMudar: (q) => mudar({ q }, { substituir: true }),
          rotulo: "Buscar nas decisões",
          sugestao: "Buscar no raciocínio: RSI, alvo, confiança…",
        }}
        ativos={ativos}
        aoLimpar={limpar}
        resumo={
          consulta.data ? (
            <>
              <span className="num">{f.filtradas.length}</span> de <span className="num">{todas.length}</span>{" "}
              decisões · {periodo}
              {todas.length >= LIMITE_API ? ` (as ${LIMITE_API} mais recentes)` : ""}
            </>
          ) : null
        }
        extra={<VisoesSalvas tela="decisoes" buscaAtual={b} aoAplicar={aplicar} />}
        maisAtivos={[b.simbolo, b.acao, b.desfecho, b.agrupar].filter(Boolean).length}
        maisFiltros={
          <>
            <FiltroChips
              rotulo="Par"
              opcoes={f.simbolos}
              selecionados={lista(b.simbolo)}
              aoMudar={(v) => mudar({ simbolo: v.join(",") || undefined })}
            />
            <FiltroChips
              rotulo="Ação"
              opcoes={f.acoes}
              selecionados={lerLista(b.acao, ACOES)}
              aoMudar={(v) => mudar({ acao: v.join(",") || undefined })}
            />
            <FiltroChips
              rotulo="Desfecho"
              opcoes={f.desfechos}
              selecionados={lerLista(b.desfecho, DESFECHOS)}
              aoMudar={(v) => mudar({ desfecho: v.join(",") || undefined })}
            />
            {visao === "cartoes" ? (
              <FiltroOpcao
                rotulo="Agrupar por"
                rotuloTodos="Dia"
                opcoes={AGRUPAR}
                valor={b.agrupar === "dia" ? undefined : b.agrupar}
                aoMudar={(agrupar) => mudar({ agrupar })}
              />
            ) : null}
          </>
        }
        ferramentas={
          <>
            <SeletorOrdem
              opcoes={ORDENS}
              valor={b.ordem ?? "data"}
              direcao={b.dir ?? "desc"}
              aoMudar={(ordem, dir) =>
                mudar({ ordem: ordem === "data" ? undefined : ordem, dir: dir === "desc" ? undefined : dir })
              }
            />
            <AlternarVisao
              opcoes={[
                { valor: "cartoes", rotulo: "Cartões", icone: LayoutList },
                { valor: "tabela", rotulo: "Tabela", icone: Table2 },
              ]}
              valor={visao}
              aoMudar={(v) => mudar({ visao: v === "cartoes" ? undefined : v })}
            />
            <AlternarDensidade
              compacta={compacta}
              aoMudar={(c) => mudar({ densidade: c ? "compacta" : undefined })}
            />
          </>
        }
      >
        <SeletorPeriodo valor={b} aoMudar={(p) => mudar(p)} />
        <FiltroChips
          rotulo="Robô"
          opcoes={f.robos}
          selecionados={lista(b.robo)}
          aoMudar={(v) => mudar({ robo: v.join(",") || undefined })}
        />
        <FiltroChips
          rotulo="Estado"
          opcoes={f.estados}
          selecionados={lerLista(b.estado, ESTADOS)}
          aoMudar={(v) => mudar({ estado: v.join(",") || undefined })}
        />
      </BarraFiltros>
      <AnalisesAoVivo robos={robos} roboId={roboUnico} />
      {consulta.isPending ? <Esqueleto forma="lista" quantidade={6} rotulo="Carregando as decisões" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {consulta.data?.length === 0 ? (
        <EstadoVazio icone={ScrollText} titulo="Nada por aqui">
          Quando uma estratégia der sinal, a decisão aparece aqui com o raciocínio, as fontes e o veredito do
          risco.
        </EstadoVazio>
      ) : null}
      {todas.length > 0 && f.filtradas.length === 0 ? <SemResultados aoLimpar={limpar} /> : null}
      {f.filtradas.length > 0 ? (
        <>
          <Totais decisoes={f.filtradas} periodo={periodo} />
          {visao === "tabela" ? (
            <TabelaDecisoes
              decisoes={pagina.itens}
              robos={robos}
              rotulo="Decisões filtradas"
              compacta={compacta}
            />
          ) : (
            <Grupos grupos={grupos} robos={robos} compacta={compacta} />
          )}
          <Paginacao
            pagina={pagina.pagina}
            paginas={pagina.paginas}
            total={pagina.total}
            porPagina={porPagina}
            aoMudar={(p) => mudar({ pagina: p > 1 ? p : undefined })}
            rotulo="Páginas de decisões"
          />
        </>
      ) : null}
    </>
  );
}
