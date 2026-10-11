import {
  INDEXADORES,
  LIQUIDEZES,
  ORIGENS_TITULO,
  TIPOS_TITULO,
  type TituloRendaFixa,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import {
  Building2,
  CalendarRange,
  ChartPie,
  ChevronRight,
  LayoutGrid,
  Layers,
  PencilLine,
  PlugZap,
  Table2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { m } from "motion/react";
import { useMemo } from "react";
import { Botao } from "../../componentes/Botao";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import {
  AlternarDensidade,
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
import { Selo } from "../../componentes/Selo";
import { useMenosMovimento } from "../../ganchos/movimento";
import { useAgora } from "../../ganchos/useAgora";
import { useTitulosRF } from "./consultas";
import {
  buscaRendaFixa,
  diaLocal,
  diasAte,
  encerrado,
  JANELAS,
  NAO_CONTAM,
  ordenarTitulos,
  predicadosRendaFixa,
  type Aba,
  type BuscaRendaFixa,
} from "./filtros";
import { data, INDEXADOR, LIQUIDEZ, pct, reais, rentabilidadeContratada, TIPO, tomDe } from "./formato";
import { AlocacaoFiltrada, EscadaVencimentos, TabelaTitulos, TotaisTitulos } from "./VisoesTitulos";

interface Grupo {
  readonly chave: string;
  readonly titulos: readonly TituloRendaFixa[];
}

/** Lotes do mesmo grupo (ex.: cada depósito numa caixinha) aparecem juntos; o resto, um por linha. */
export function agrupar(titulos: readonly TituloRendaFixa[]): Grupo[] {
  const grupos = new Map<string, TituloRendaFixa[]>();
  for (const t of titulos) {
    const chave = t.grupo ?? t.id;
    grupos.set(chave, [...(grupos.get(chave) ?? []), t]);
  }
  return [...grupos.entries()].map(([chave, lista]) => ({ chave, titulos: lista }));
}

/** Soma dos lotes; se algum lote não tem posição, a soma não existe (null). */
export function somarLotes(lotes: readonly TituloRendaFixa[]) {
  const aplicado = lotes.reduce((s, t) => s.plus(t.valorAplicado), dec(0));
  if (lotes.some((t) => !t.posicao.disponivel))
    return { aplicado: aplicado.toFixed(2), bruto: null, liquido: null, rendimento: null };
  const somar = (campo: "bruto" | "liquido" | "rendimentoBruto") =>
    lotes.reduce((s, t) => (t.posicao.disponivel ? s.plus(t.posicao[campo]) : s), dec(0)).toFixed(2);
  return {
    aplicado: aplicado.toFixed(2),
    bruto: somar("bruto"),
    liquido: somar("liquido"),
    rendimento: somar("rendimentoBruto"),
  };
}

function Numeros({ t }: { readonly t: TituloRendaFixa }) {
  const p = t.posicao;
  if (!p.disponivel) {
    return (
      <p className="rf-cartao__falta">
        <TriangleAlert size={15} aria-hidden="true" /> {p.motivo}
      </p>
    );
  }
  return (
    <dl className="rf-cartao__numeros">
      <div>
        <dt>Aplicado</dt>
        <dd className="num">{reais(p.aplicado)}</dd>
      </div>
      <div>
        <dt>Bruto hoje</dt>
        <dd className="num">{reais(p.bruto)}</dd>
      </div>
      <div>
        <dt>Líquido</dt>
        <dd className="num">{reais(p.liquido)}</dd>
      </div>
      <div>
        <dt>Rendimento</dt>
        <dd className={`num ${tomDe(p.rendimentoBruto)}`}>
          {reais(p.rendimentoBruto, { sinal: true })}{" "}
          <span className="apagado">({pct(p.rentabilidadeBrutaPct, { sinal: true })})</span>
        </dd>
      </div>
      <div>
        <dt>% do CDI no período</dt>
        <dd className="num">{p.percentualDoCdi ? pct(p.percentualDoCdi, { casas: 1 }) : "—"}</dd>
      </div>
    </dl>
  );
}

function Cartao({ t, abrir }: { readonly t: TituloRendaFixa; readonly abrir: (id: string) => void }) {
  return (
    <button
      type="button"
      className="rf-cartao"
      onClick={() => abrir(t.id)}
      aria-label={`Ver detalhes de ${t.nome}`}
    >
      <div className="rf-cartao__topo">
        <span className="rf-cartao__nome">{t.nome}</span>
        <ChevronRight size={16} aria-hidden="true" className="apagado" />
      </div>
      <div className="rf-cartao__selos">
        <Selo tom="marca">{TIPO[t.tipo]}</Selo>
        {t.posicao.disponivel && t.posicao.vencido ? <Selo tom="atencao">Venceu</Selo> : null}
        <Selo icone={t.origem === "pluggy" ? PlugZap : PencilLine}>
          {t.origem === "pluggy" ? "Pluggy" : "Manual"}
        </Selo>
        <span className="apagado">{rentabilidadeContratada(t)}</span>
      </div>
      <Numeros t={t} />
      <p className="rf-cartao__rodape apagado">
        {t.emissor ? (
          <>
            <Building2 size={13} aria-hidden="true" /> {t.emissor} ·{" "}
          </>
        ) : null}
        aplicado em {data(t.dataAplicacao)} ·{" "}
        {t.vencimento ? `vence em ${data(t.vencimento)}` : "sem vencimento"} · liquidez{" "}
        {LIQUIDEZ[t.liquidez].toLowerCase()}
      </p>
    </button>
  );
}

function CartaoGrupo({ g, abrir }: { readonly g: Grupo; readonly abrir: (id: string) => void }) {
  const [primeiro] = g.titulos;
  if (!primeiro) return null;
  const soma = somarLotes(g.titulos);
  return (
    <details className="rf-grupo">
      <summary className="rf-cartao">
        <div className="rf-cartao__topo">
          <span className="rf-cartao__nome">{primeiro.nome}</span>
          <Selo icone={Layers}>{`${g.titulos.length} lotes`}</Selo>
        </div>
        <dl className="rf-cartao__numeros">
          <div>
            <dt>Aplicado</dt>
            <dd className="num">{reais(soma.aplicado)}</dd>
          </div>
          <div>
            <dt>Bruto hoje</dt>
            <dd className="num">{reais(soma.bruto)}</dd>
          </div>
          <div>
            <dt>Líquido</dt>
            <dd className="num">{reais(soma.liquido)}</dd>
          </div>
          <div>
            <dt>Rendimento</dt>
            <dd className={`num ${tomDe(soma.rendimento)}`}>{reais(soma.rendimento, { sinal: true })}</dd>
          </div>
        </dl>
        <p className="rf-cartao__rodape apagado">
          Cada depósito é um lote com data própria: o IR de cada um segue a idade do lote. Abra para ver.
        </p>
      </summary>
      <ul className="rf-lista rf-lista--lotes" role="list">
        {g.titulos.map((t) => (
          <li key={t.id}>
            <Cartao t={t} abrir={abrir} />
          </li>
        ))}
      </ul>
    </details>
  );
}

const ORDENACOES = [
  { valor: "vencimento", rotulo: "Vencimento", direcao: "asc" },
  { valor: "valor", rotulo: "Valor hoje", direcao: "desc" },
  { valor: "rendimento", rotulo: "Rendimento", direcao: "desc" },
  { valor: "aplicacao", rotulo: "Data da aplicação", direcao: "desc" },
  { valor: "nome", rotulo: "Nome", direcao: "asc" },
] as const;

const VISOES = [
  { valor: "cartoes", rotulo: "Cartões", icone: LayoutGrid },
  { valor: "tabela", rotulo: "Tabela", icone: Table2 },
  { valor: "escada", rotulo: "Vencimentos", icone: CalendarRange },
  { valor: "alocacao", rotulo: "Alocação", icone: ChartPie },
] as const;

const JANELA: Readonly<Record<(typeof JANELAS)[number], string>> = {
  "30": "Em 30 dias",
  "90": "Em 90 dias",
  "365": "Em 1 ano",
};

/** As opções de cada filtro com a contagem de títulos que trariam (com os outros filtros valendo). */
function useFacetas(titulos: readonly TituloRendaFixa[], b: BuscaRendaFixa, hoje: string) {
  return useMemo(() => {
    const predicados = predicadosRendaFixa(b, hoje);
    const contar = <K,>(faceta: string, chave: (t: TituloRendaFixa) => K) =>
      contarPor(filtrarCom(titulos, predicados, faceta), chave);
    const presentes = <K extends string>(todos: readonly K[], chave: (t: TituloRendaFixa) => K) => {
      const ha = new Set(titulos.map(chave));
      return todos.filter((k) => ha.has(k));
    };
    const opcoes = <K extends string>(
      faceta: string,
      todos: readonly K[],
      chave: (t: TituloRendaFixa) => K,
      rotulo: (k: K) => string,
    ) => {
      const n = contar(faceta, chave);
      return presentes(todos, chave).map((k) => ({ valor: k, rotulo: rotulo(k), contagem: n.get(k) ?? 0 }));
    };
    const janela = (dias: number) =>
      filtrarCom(titulos, { ...predicados, vence: () => true }, "vence").filter(
        (t) => t.vencimento !== null && !encerrado(t, hoje) && diasAte(t.vencimento, hoje) <= dias,
      ).length;
    const situacao = contar("situacao", (t) => (encerrado(t, hoje) ? "encerrado" : "ativo"));
    return {
      tipos: opcoes(
        "tipo",
        TIPOS_TITULO,
        (t) => t.tipo,
        (k) => TIPO[k],
      ),
      indexadores: opcoes(
        "indexador",
        INDEXADORES,
        (t) => t.indexador,
        (k) => INDEXADOR[k],
      ),
      origens: opcoes(
        "origem",
        ORIGENS_TITULO,
        (t) => t.origem,
        (k) => (k === "pluggy" ? "Pluggy" : "Manual"),
      ),
      liquidezes: opcoes(
        "liquidez",
        LIQUIDEZES,
        (t) => t.liquidez,
        (k) => LIQUIDEZ[k],
      ),
      janelas: JANELAS.map((j) => ({ valor: j, rotulo: JANELA[j], contagem: janela(Number(j)) })),
      situacoes: [
        { valor: "ativo" as const, rotulo: "Ativos", contagem: situacao.get("ativo") ?? 0 },
        { valor: "encerrado" as const, rotulo: "Vencidos", contagem: situacao.get("encerrado") ?? 0 },
      ],
      filtrados: filtrarCom(titulos, predicados),
    };
  }, [titulos, b, hoje]);
}

function ListaCartoes({
  titulos,
  abrir,
  compacta,
}: {
  readonly titulos: readonly TituloRendaFixa[];
  readonly abrir: (id: string) => void;
  readonly compacta: boolean;
}) {
  const menos = useMenosMovimento();
  return (
    <ul className={`rf-lista ${compacta ? "rf-lista--compacta" : ""}`} role="list">
      {agrupar(titulos).map((g, i) => (
        <m.li
          key={g.chave}
          initial={menos ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: menos ? 0 : 0.25, delay: menos ? 0 : Math.min(i, 8) * 0.03 }}
        >
          {g.titulos.length === 1 && g.titulos[0] ? (
            <Cartao t={g.titulos[0]} abrir={abrir} />
          ) : (
            <CartaoGrupo g={g} abrir={abrir} />
          )}
        </m.li>
      ))}
    </ul>
  );
}

export function Titulos({
  irPara,
  abrir,
}: {
  readonly irPara: (a: Aba) => void;
  readonly abrir: (id: string) => void;
}) {
  const { data: titulos, error, isPending, refetch } = useTitulosRF();
  const { busca: b, mudar, limpar, aplicar, ativos } = useFiltrosUrl(buscaRendaFixa, NAO_CONTAM);
  const hoje = diaLocal(useAgora(60_000));
  const f = useFacetas(titulos ?? [], b, hoje);
  if (isPending) return <Esqueleto linhas={6} rotulo="Carregando os títulos" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} />;
  if (titulos.length === 0) {
    return (
      <EstadoVazio
        icone={WalletCards}
        titulo="Sem títulos para mostrar"
        acao={
          <Botao variante="primario" onClick={() => irPara("cadastrar")}>
            Cadastrar um título
          </Botao>
        }
      >
        Aqui aparece cada CDB, LCI, LCA, Tesouro, debênture, caixinha ou poupança, com o valor de hoje, o IR e
        o IOF estimados e o líquido.
      </EstadoVazio>
    );
  }
  const visao = b.visao ?? "cartoes";
  const ordenados = ordenarTitulos(f.filtrados, b);
  const ordem = b.ordem ?? "vencimento";
  const padrao = ORDENACOES.find((o) => o.valor === ordem)?.direcao ?? "asc";
  return (
    <div className="pilha">
      <BarraFiltros
        rotulo="Filtros dos títulos"
        busca={{
          valor: b.q,
          aoMudar: (q) => mudar({ q }, { substituir: true }),
          rotulo: "Buscar títulos",
          sugestao: "Buscar por nome ou emissor…",
        }}
        ativos={ativos}
        aoLimpar={limpar}
        resumo={
          <>
            <span className="num">{f.filtrados.length}</span> de <span className="num">{titulos.length}</span>{" "}
            títulos
          </>
        }
        extra={<VisoesSalvas tela="renda-fixa" buscaAtual={b} aoAplicar={aplicar} />}
        ferramentas={
          <>
            <SeletorOrdem
              opcoes={ORDENACOES}
              valor={ordem}
              direcao={b.dir ?? padrao}
              aoMudar={(o, dir) => {
                const nova = ORDENACOES.find((x) => x.valor === o);
                mudar({
                  ordem: o === "vencimento" ? undefined : o,
                  dir: dir === nova?.direcao ? undefined : dir,
                });
              }}
            />
            <AlternarVisao
              opcoes={VISOES}
              valor={visao}
              aoMudar={(v) => mudar({ visao: v === "cartoes" ? undefined : v })}
            />
            {visao === "cartoes" ? (
              <AlternarDensidade
                compacta={b.densidade === "compacta"}
                aoMudar={(c) => mudar({ densidade: c ? "compacta" : undefined })}
              />
            ) : null}
          </>
        }
        maisAtivos={[b.origem, b.liquidez, b.situacao].filter(Boolean).length}
        maisFiltros={
          <>
            <FiltroChips
              rotulo="Origem"
              opcoes={f.origens}
              selecionados={lerLista(b.origem, ORIGENS_TITULO)}
              aoMudar={(v) => mudar({ origem: v.join(",") || undefined })}
            />
            <FiltroChips
              rotulo="Liquidez"
              opcoes={f.liquidezes}
              selecionados={lerLista(b.liquidez, LIQUIDEZES)}
              aoMudar={(v) => mudar({ liquidez: v.join(",") || undefined })}
            />
            <FiltroOpcao
              rotulo="Situação"
              opcoes={f.situacoes}
              valor={b.situacao}
              aoMudar={(situacao) => mudar({ situacao })}
            />
          </>
        }
      >
        <FiltroChips
          rotulo="Tipo"
          opcoes={f.tipos}
          selecionados={lerLista(b.tipo, TIPOS_TITULO)}
          aoMudar={(v) => mudar({ tipo: v.join(",") || undefined })}
        />
        <FiltroChips
          rotulo="Indexador"
          opcoes={f.indexadores}
          selecionados={lerLista(b.indexador, INDEXADORES)}
          aoMudar={(v) => mudar({ indexador: v.join(",") || undefined })}
        />
        <FiltroOpcao
          rotulo="Vence"
          rotuloTodos="Qualquer data"
          opcoes={f.janelas}
          valor={b.vence}
          aoMudar={(vence) => mudar({ vence })}
        />
      </BarraFiltros>
      {f.filtrados.length === 0 ? (
        <SemResultados aoLimpar={limpar} />
      ) : (
        <>
          <TotaisTitulos titulos={ordenados} />
          {visao === "cartoes" ? (
            <ListaCartoes titulos={ordenados} abrir={abrir} compacta={b.densidade === "compacta"} />
          ) : null}
          {visao === "tabela" ? <TabelaTitulos titulos={ordenados} hoje={hoje} abrir={abrir} /> : null}
          {visao === "escada" ? <EscadaVencimentos titulos={ordenados} hoje={hoje} abrir={abrir} /> : null}
          {visao === "alocacao" ? <AlocacaoFiltrada titulos={ordenados} /> : null}
        </>
      )}
    </div>
  );
}
