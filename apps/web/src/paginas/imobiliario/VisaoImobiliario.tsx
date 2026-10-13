import {
  TIPOS_IMOBILIARIO,
  type ItemImobiliario,
  type VisaoImobiliario as Visao,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Calculator,
  CalendarDays,
  ChartPie,
  LayoutList,
  Plus,
  Table2,
  TrendingUp,
} from "lucide-react";
import { m } from "motion/react";
import { useMemo } from "react";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import {
  AlternarVisao,
  BarraFiltros,
  contarPor,
  FiltroChips,
  filtrarCom,
  FiltroOpcao,
  lerLista,
  SeletorOrdem,
  SemResultados,
  useFiltrosUrl,
  VisoesSalvas,
} from "../../componentes/filtros";
import { CartaoKpi, GradeKpi } from "../../componentes/Kpi";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { useMenosMovimento } from "../../ganchos/movimento";
import { sinalDe } from "../../lib/formatar";
import { PremissaCdi, Premissas } from "./componentes";
import { FONTE_VALOR, formatarReais, formatarTaxa, TIPOS } from "./formato";
import {
  alocacaoPorTipo,
  buscaImobiliario,
  MOEDAS,
  ordenarImobiliario,
  predicadosImobiliario,
  totalizarImobiliario,
  type BuscaImobiliario,
  type TotaisImobiliario,
} from "./filtros";
import { useCdiPremissa, useVisaoImobiliario } from "./ganchos";
import { Rosca } from "./graficos/Rosca";
import "./imobiliario.css";

/** Visão geral do imobiliário: patrimônio, renda, alocação e cada investimento, com filtros na URL. */
const reais = (t: string) => formatarReais(t);

function Numeros({
  t,
  quantidade,
  recorte,
}: {
  readonly t: TotaisImobiliario;
  readonly quantidade: number;
  readonly recorte: boolean;
}) {
  return (
    <GradeKpi
      rotulo={recorte ? "Totais dos investimentos filtrados" : "Totais do imobiliário"}
      className="imob-kpis"
    >
      <CartaoKpi
        destaque
        rotulo="Patrimônio imobiliário líquido"
        icone={Building2}
        valor={<NumeroAnimado valor={t.patrimonio} formatar={reais} />}
        nota={`valor atual menos dívidas, em ${quantidade} ${quantidade === 1 ? "investimento" : "investimentos"}${recorte ? " filtrados" : ""}`}
      />
      <CartaoKpi
        rotulo="Renda mensal líquida"
        icone={CalendarDays}
        valor={<NumeroAnimado valor={t.rendaMensal} formatar={reais} />}
        nota="média dos últimos 12 meses, já sem despesas"
      />
      <CartaoKpi
        rotulo="Resultado líquido"
        icone={TrendingUp}
        valor={
          <NumeroAnimado
            valor={t.resultadoLiquido}
            formatar={(x) => formatarReais(x, { sinal: true })}
            className={sinalDe(t.resultadoLiquido) === "neutro" ? "" : sinalDe(t.resultadoLiquido)}
          />
        }
        nota={`sobre ${formatarReais(t.investido)} aportados`}
      />
    </GradeKpi>
  );
}

function Cartao({ item, indice }: { readonly item: ItemImobiliario; readonly indice: number }) {
  const { investimento: inv, metricas: met } = item;
  const tipo = TIPOS[inv.tipo];
  const Icone = tipo.icone;
  const menos = useMenosMovimento();
  return (
    <m.li
      initial={menos ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: menos ? 0 : 0.25, delay: menos ? 0 : Math.min(indice * 0.04, 0.3) }}
    >
      <Link to="/imobiliario/$id" params={{ id: inv.id }} className="imob-cartao">
        <span className="imob-cartao__icone" aria-hidden="true">
          <Icone size={18} strokeWidth={1.8} />
        </span>
        <span>
          <span className="imob-cartao__nome">{inv.nome}</span>
          <span className="imob-cartao__meta">
            {" "}
            · {tipo.rotulo}
            {inv.ticker ? ` · ${inv.ticker}` : ""}
            {inv.moeda === "USD" ? " · em dólar" : ""}
          </span>
          <span className="imob-cartao__meta imob-cartao__linha">
            {met ? `Valor atual ${FONTE_VALOR[met.fonteValorAtual]}` : item.erroMetricas}
            {met?.encerrado ? " · encerrado" : ""}
            {inv.financiamento ? " · financiado" : ""}
          </span>
        </span>
        {met ? (
          <span className="imob-cartao__numeros">
            <span className="num">{formatarReais(met.patrimonioLiquido)}</span>
            <small className={`num ${sinalDe(met.resultadoLiquido)}`}>
              {formatarReais(met.resultadoLiquido, { sinal: true })} · TIR {formatarTaxa(met.tirAnual, 1)}{" "}
              a.a.
            </small>
            {met.cdi ? (
              <small className="num apagado">
                vs. CDI: {formatarReais(met.cdi.diferenca, { sinal: true })}
              </small>
            ) : null}
          </span>
        ) : null}
      </Link>
    </m.li>
  );
}

function Tabela({ itens }: { readonly itens: readonly ItemImobiliario[] }) {
  return (
    <div
      className="tabela-rolagem tabela-rolagem--alta"
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label="Investimentos filtrados (role para os lados)"
    >
      <table className="tabela tabela--zebra imob-tabela">
        <caption className="so-leitor">Investimentos imobiliários filtrados, valores em reais</caption>
        <thead>
          <tr>
            <th scope="col">Investimento</th>
            <th scope="col" className="tabela__num">
              Patrimônio
            </th>
            <th scope="col" className="tabela__num">
              Aportado
            </th>
            <th scope="col" className="tabela__num">
              Resultado
            </th>
            <th scope="col" className="tabela__num">
              TIR a.a.
            </th>
            <th scope="col" className="tabela__num">
              DY 12m
            </th>
            <th scope="col" className="tabela__num">
              Renda/mês
            </th>
            <th scope="col" className="tabela__num">
              Dívida
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map(({ investimento: inv, metricas: met, erroMetricas }) => (
            <tr key={inv.id}>
              <th scope="row">
                <Link to="/imobiliario/$id" params={{ id: inv.id }} className="imob-tabela__nome">
                  {inv.nome}
                </Link>
                <span className="imob-tabela__sub">
                  {TIPOS[inv.tipo].rotulo}
                  {inv.ticker ? ` · ${inv.ticker}` : ""}
                  {met?.encerrado ? " · encerrado" : ""}
                </span>
              </th>
              {met ? (
                <>
                  <td className="tabela__num num">{formatarReais(met.patrimonioLiquido)}</td>
                  <td className="tabela__num num">{formatarReais(met.investido)}</td>
                  <td className={`tabela__num num ${sinalDe(met.resultadoLiquido)}`}>
                    {formatarReais(met.resultadoLiquido, { sinal: true })}
                  </td>
                  <td className="tabela__num num">{formatarTaxa(met.tirAnual, 1)}</td>
                  <td className="tabela__num num">{formatarTaxa(met.dividendYield, 1)}</td>
                  <td className="tabela__num num">{formatarReais(met.rendaMensalLiquidaMedia)}</td>
                  <td className="tabela__num num">
                    {dec(met.dividaAtual).isZero() ? "—" : formatarReais(met.dividaAtual)}
                  </td>
                </>
              ) : (
                <td colSpan={7} className="apagado">
                  {erroMetricas ?? "sem métricas"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ORDENACOES = [
  { valor: "valor", rotulo: "Patrimônio", direcao: "desc" },
  { valor: "resultado", rotulo: "Resultado", direcao: "desc" },
  { valor: "tir", rotulo: "TIR", direcao: "desc" },
  { valor: "dy", rotulo: "Dividend yield", direcao: "desc" },
  { valor: "renda", rotulo: "Renda mensal", direcao: "desc" },
  { valor: "nome", rotulo: "Nome", direcao: "asc" },
] as const;

const VISOES = [
  { valor: "cartoes", rotulo: "Cartões", icone: LayoutList },
  { valor: "tabela", rotulo: "Tabela", icone: Table2 },
  { valor: "alocacao", rotulo: "Alocação", icone: ChartPie },
] as const;

const MOEDA: Readonly<Record<(typeof MOEDAS)[number], string>> = { BRL: "Real", USD: "Dólar" };

function useFacetas(itens: readonly ItemImobiliario[], b: BuscaImobiliario) {
  return useMemo(() => {
    const predicados = predicadosImobiliario(b);
    const contar = <K,>(faceta: string, chave: (i: ItemImobiliario) => K) =>
      contarPor(filtrarCom(itens, predicados, faceta), chave);
    const tipos = new Set(itens.map((i) => i.investimento.tipo));
    const moedas = new Set(itens.map((i) => i.investimento.moeda));
    const porTipo = contar("tipo", (i) => i.investimento.tipo);
    const porMoeda = contar("moeda", (i) => i.investimento.moeda);
    const porFin = contar("financiamento", (i) => (i.investimento.financiamento ? "com" : "sem"));
    const porSituacao = contar("situacao", (i) => (i.metricas?.encerrado ? "encerrado" : "ativo"));
    return {
      tipos: TIPOS_IMOBILIARIO.filter((t) => tipos.has(t)).map((t) => ({
        valor: t,
        rotulo: TIPOS[t].rotulo,
        contagem: porTipo.get(t) ?? 0,
      })),
      moedas: MOEDAS.filter((x) => moedas.has(x)).map((x) => ({
        valor: x,
        rotulo: MOEDA[x],
        contagem: porMoeda.get(x) ?? 0,
      })),
      financiamento: [
        { valor: "com" as const, rotulo: "Financiados", contagem: porFin.get("com") ?? 0 },
        { valor: "sem" as const, rotulo: "Sem financiamento", contagem: porFin.get("sem") ?? 0 },
      ],
      situacoes: [
        { valor: "ativo" as const, rotulo: "Ativos", contagem: porSituacao.get("ativo") ?? 0 },
        { valor: "encerrado" as const, rotulo: "Encerrados", contagem: porSituacao.get("encerrado") ?? 0 },
      ],
      filtrados: filtrarCom(itens, predicados),
    };
  }, [itens, b]);
}

function Alocacao({ itens, total }: { readonly itens: readonly ItemImobiliario[]; readonly total: string }) {
  const fatias = alocacaoPorTipo(itens).map((a) => ({
    nome: TIPOS[a.tipo].rotulo,
    valor: Number(a.valor),
    texto: formatarReais(a.valor, { compacto: true }),
  }));
  return (
    <Rosca
      titulo="Alocação do patrimônio imobiliário por tipo"
      fatias={fatias}
      centro={formatarReais(total, { compacto: true })}
      legendaCentro="patrimônio"
    />
  );
}

function Conteudo({ v }: { readonly v: Visao }) {
  const { busca: b, mudar, limpar, aplicar, ativos } = useFiltrosUrl(buscaImobiliario);
  const f = useFacetas(v.itens, b);
  if (v.quantidade === 0) {
    return (
      <EstadoVazio
        icone={Building2}
        titulo="Nenhum investimento imobiliário ainda"
        acao={
          <span className="imob-barra">
            <Link to="/imobiliario/novo" className="botao botao--primario">
              Cadastrar o primeiro
            </Link>
            <Link to="/imobiliario/simuladores" className="botao botao--secundario">
              Usar os simuladores
            </Link>
          </span>
        }
      >
        Cadastre um imóvel, um FII, um consórcio ou outro investimento para acompanhar quanto você pôs, quanto
        rendeu e quanto vale hoje. Os simuladores funcionam sem cadastro.
      </EstadoVazio>
    );
  }
  const recorte = f.filtrados.length !== v.itens.length;
  const totais = totalizarImobiliario(f.filtrados);
  const ordenados = ordenarImobiliario(f.filtrados, b);
  const visao = b.visao ?? "cartoes";
  const ordem = b.ordem ?? "valor";
  const padrao = ORDENACOES.find((o) => o.valor === ordem)?.direcao ?? "desc";
  return (
    <>
      <div className="imob-topo">
        <Numeros t={totais} quantidade={f.filtrados.length} recorte={recorte} />
        {visao !== "alocacao" ? (
          <Painel titulo="Alocação por tipo" id="titulo-alocacao">
            <Alocacao itens={f.filtrados} total={totais.patrimonio} />
          </Painel>
        ) : null}
      </div>
      <BarraFiltros
        rotulo="Filtros dos investimentos"
        busca={{
          valor: b.q,
          aoMudar: (q) => mudar({ q }, { substituir: true }),
          rotulo: "Buscar investimentos",
          sugestao: "Buscar por nome ou ticker…",
        }}
        ativos={ativos}
        aoLimpar={limpar}
        resumo={
          <>
            <span className="num">{f.filtrados.length}</span> de <span className="num">{v.itens.length}</span>{" "}
            investimentos
            {totais.semMetricas > 0 ? ` · ${totais.semMetricas} sem métricas, fora das somas` : ""}
          </>
        }
        extra={<VisoesSalvas tela="imobiliario" buscaAtual={b} aoAplicar={aplicar} />}
        ferramentas={
          <>
            <SeletorOrdem
              opcoes={ORDENACOES}
              valor={ordem}
              direcao={b.dir ?? padrao}
              aoMudar={(o, dir) => {
                const nova = ORDENACOES.find((x) => x.valor === o);
                mudar({ ordem: o === "valor" ? undefined : o, dir: dir === nova?.direcao ? undefined : dir });
              }}
            />
            <AlternarVisao
              opcoes={VISOES}
              valor={visao}
              aoMudar={(x) => mudar({ visao: x === "cartoes" ? undefined : x })}
            />
          </>
        }
        maisAtivos={[b.moeda, b.financiamento].filter(Boolean).length}
        maisFiltros={
          <>
            {f.moedas.length > 1 ? (
              <FiltroChips
                rotulo="Moeda"
                opcoes={f.moedas}
                selecionados={lerLista(b.moeda, MOEDAS)}
                aoMudar={(x) => mudar({ moeda: x.join(",") || undefined })}
              />
            ) : null}
            <FiltroOpcao
              rotulo="Financiamento"
              opcoes={f.financiamento}
              valor={b.financiamento}
              aoMudar={(financiamento) => mudar({ financiamento })}
            />
          </>
        }
      >
        <FiltroChips
          rotulo="Tipo"
          opcoes={f.tipos}
          selecionados={lerLista(b.tipo, TIPOS_IMOBILIARIO)}
          aoMudar={(x) => mudar({ tipo: x.join(",") || undefined })}
        />
        <FiltroOpcao
          rotulo="Situação"
          opcoes={f.situacoes}
          valor={b.situacao}
          aoMudar={(situacao) => mudar({ situacao })}
        />
      </BarraFiltros>
      {f.filtrados.length === 0 ? <SemResultados aoLimpar={limpar} /> : null}
      {f.filtrados.length > 0 && visao === "cartoes" ? (
        <Painel titulo="Investimentos" id="titulo-investimentos">
          <ul className="imob-lista" role="list">
            {ordenados.map((i, k) => (
              <Cartao key={i.investimento.id} item={i} indice={k} />
            ))}
          </ul>
        </Painel>
      ) : null}
      {f.filtrados.length > 0 && visao === "tabela" ? <Tabela itens={ordenados} /> : null}
      {f.filtrados.length > 0 && visao === "alocacao" ? (
        <Painel titulo="Alocação por tipo" id="titulo-alocacao" variante="destaque">
          <div className="imob-alocacao-grande">
            <Alocacao itens={f.filtrados} total={totais.patrimonio} />
          </div>
        </Painel>
      ) : null}
    </>
  );
}

const PREMISSAS_VISAO = [
  "Patrimônio = valor atual (cotação, valor informado, valorização estimada ou custo) menos o saldo devedor.",
  "Resultado líquido = patrimônio + vendas + renda − aportes − parcelas − despesas − impostos; sem IR sobre ganho ainda não realizado.",
  "TIR anual realizada pelas datas de cada lançamento, até hoje.",
];

export function VisaoImobiliario() {
  const [cdi, setCdi] = useCdiPremissa();
  const { data, error, isPending, refetch } = useVisaoImobiliario(cdi);
  return (
    <div className="pilha">
      <Cabecalho
        titulo="Imobiliário"
        acoes={
          <>
            <Link to="/imobiliario/simuladores" className="botao botao--secundario">
              <Calculator size={16} aria-hidden="true" /> Simuladores
            </Link>
            <Link to="/imobiliario/novo" className="botao botao--primario">
              <Plus size={16} aria-hidden="true" /> Cadastrar
            </Link>
          </>
        }
      >
        Imóveis, fundos, consórcio e afins: quanto você pôs, quanto rendeu e quanto vale hoje, com as contas à
        vista.
      </Cabecalho>
      {isPending ? <Esqueleto forma="kpis" quantidade={3} rotulo="Carregando o imobiliário" /> : null}
      {error ? <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} /> : null}
      {data ? <Conteudo v={data} /> : null}
      <div className="imob-rodape">
        <Painel titulo="Comparar com o CDI" id="titulo-cdi" variante="plano">
          <PremissaCdi cdi={cdi} aoMudar={setCdi} />
        </Painel>
        <Premissas itens={PREMISSAS_VISAO} />
      </div>
    </div>
  );
}
