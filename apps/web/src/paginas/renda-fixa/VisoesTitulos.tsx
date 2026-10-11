import type { TituloRendaFixa } from "@zentrade/contratos/esquemas";
import { CalendarClock, PencilLine, PlugZap } from "lucide-react";
import { m } from "motion/react";
import { Painel } from "../../componentes/Cabecalho";
import { useMenosMovimento } from "../../ganchos/movimento";
import { alocacaoPor, diasAte, encerrado, escadaDeVencimentos, type DegrauVencimento } from "./filtros";
import { data, INDEXADOR, LIQUIDEZ, pct, reais, rentabilidadeContratada, TIPO, tomDe } from "./formato";
import { corDe, Legenda, Rosca } from "./Graficos";
import { somarLotes } from "./Titulos";

/** As outras formas de ver os títulos filtrados: totais, tabela, escada de vencimentos e alocação. */
const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
function mesPorExtenso(mes: string): string {
  if (mes === "sem") return "Sem vencimento";
  const texto = nomeMes.format(Date.parse(`${mes}-01T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function TotaisTitulos({ titulos }: { readonly titulos: readonly TituloRendaFixa[] }) {
  const s = somarLotes(titulos);
  return (
    <dl className="rf-totais" aria-label="Totais dos títulos filtrados">
      <div>
        <dt>Títulos</dt>
        <dd className="num">{titulos.length}</dd>
      </div>
      <div>
        <dt>Aplicado</dt>
        <dd className="num">{reais(s.aplicado)}</dd>
      </div>
      <div>
        <dt>Bruto hoje</dt>
        <dd className="num">{reais(s.bruto)}</dd>
      </div>
      <div>
        <dt>Líquido estimado</dt>
        <dd className="num">{reais(s.liquido)}</dd>
      </div>
      <div>
        <dt>Rendimento bruto</dt>
        <dd className={`num ${tomDe(s.rendimento)}`}>{reais(s.rendimento, { sinal: true })}</dd>
      </div>
      {s.bruto === null ? (
        <p className="rf-totais__nota">
          Algum título está sem posição (falta índice ou taxa): sem soma de hoje.
        </p>
      ) : null}
    </dl>
  );
}

export function TabelaTitulos({
  titulos,
  hoje,
  abrir,
}: {
  readonly titulos: readonly TituloRendaFixa[];
  readonly hoje: string;
  readonly abrir: (id: string) => void;
}) {
  return (
    <div
      className="tabela-rolagem"
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label="Títulos filtrados (role para os lados)"
    >
      <table className="tabela rf-tabela">
        <caption className="so-leitor">
          Títulos de renda fixa filtrados. Abra o nome para ver o detalhe.
        </caption>
        <thead>
          <tr>
            <th scope="col">Título</th>
            <th scope="col">Rende</th>
            <th scope="col" className="tabela__num">
              Aplicado
            </th>
            <th scope="col" className="tabela__num">
              Bruto hoje
            </th>
            <th scope="col" className="tabela__num">
              Líquido
            </th>
            <th scope="col" className="tabela__num">
              Rendimento
            </th>
            <th scope="col">Vencimento</th>
            <th scope="col">Liquidez</th>
          </tr>
        </thead>
        <tbody>
          {titulos.map((t) => {
            const p = t.posicao;
            const vencido = encerrado(t, hoje);
            return (
              <tr key={t.id}>
                <th scope="row">
                  <button type="button" className="rf-tabela__nome" onClick={() => abrir(t.id)}>
                    {t.nome}
                  </button>
                  <span className="rf-tabela__sub">
                    {TIPO[t.tipo]}
                    {t.origem === "pluggy" ? " · Pluggy" : ""}
                    {t.emissor ? ` · ${t.emissor}` : ""}
                  </span>
                </th>
                <td>{rentabilidadeContratada(t)}</td>
                <td className="tabela__num num">{reais(t.valorAplicado)}</td>
                <td className="tabela__num num">{p.disponivel ? reais(p.bruto) : "—"}</td>
                <td className="tabela__num num">{p.disponivel ? reais(p.liquido) : "—"}</td>
                <td className={`tabela__num num ${p.disponivel ? tomDe(p.rendimentoBruto) : ""}`}>
                  {p.disponivel ? pct(p.rentabilidadeBrutaPct, { sinal: true }) : "—"}
                </td>
                <td>
                  {t.vencimento ? (
                    <>
                      <span className="num">{data(t.vencimento)}</span>
                      <span className="rf-tabela__sub">
                        {vencido ? "venceu" : `em ${diasAte(t.vencimento, hoje)} dias`}
                      </span>
                    </>
                  ) : (
                    <span className="apagado">sem vencimento</span>
                  )}
                </td>
                <td>{LIQUIDEZ[t.liquidez]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Degrau({
  d,
  maior,
  hoje,
  abrir,
  indice,
}: {
  readonly d: DegrauVencimento;
  readonly maior: number;
  readonly hoje: string;
  readonly abrir: (id: string) => void;
  readonly indice: number;
}) {
  const menos = useMenosMovimento();
  const largura = maior > 0 ? Math.max(2, (d.valor / maior) * 100) : 0;
  return (
    <li className={`rf-escada__degrau ${d.passado ? "rf-escada__degrau--passado" : ""}`}>
      <p className="rf-escada__mes">
        {mesPorExtenso(d.mes)}
        {d.passado ? <span className="rf-escada__marca">venceu</span> : null}
      </p>
      <div className="rf-escada__barra-area">
        <m.span
          className="rf-escada__barra"
          aria-hidden="true"
          initial={menos ? false : { width: 0 }}
          animate={{ width: `${largura}%` }}
          transition={{ duration: menos ? 0 : 0.5, delay: menos ? 0 : Math.min(indice, 10) * 0.04 }}
        />
        <span className="rf-escada__valor num">{reais(d.valor.toFixed(2))}</span>
      </div>
      <ul role="list" className="rf-escada__titulos">
        {d.titulos.map((t) => (
          <li key={t.id}>
            <button type="button" className="rf-escada__titulo" onClick={() => abrir(t.id)}>
              {t.origem === "pluggy" ? (
                <PlugZap size={13} aria-label="Pluggy" />
              ) : (
                <PencilLine size={13} aria-label="Manual" />
              )}
              <span>{t.nome}</span>
              <span className="apagado num">
                {t.vencimento
                  ? `${data(t.vencimento)}${encerrado(t, hoje) ? "" : ` · em ${diasAte(t.vencimento, hoje)} d`}`
                  : LIQUIDEZ[t.liquidez].toLowerCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Um degrau por mês: quanto dinheiro volta (ou fica livre) em cada mês. */
export function EscadaVencimentos({
  titulos,
  hoje,
  abrir,
}: {
  readonly titulos: readonly TituloRendaFixa[];
  readonly hoje: string;
  readonly abrir: (id: string) => void;
}) {
  const escada = escadaDeVencimentos(titulos, hoje);
  const maior = Math.max(0, ...escada.map((d) => d.valor));
  return (
    <section className="rf-escada" aria-labelledby="rf-escada-titulo">
      <h2 id="rf-escada-titulo" className="rf-escada__titulo-secao">
        <CalendarClock size={16} aria-hidden="true" /> Escada de vencimentos
      </h2>
      <p className="apagado rf-escada__explica">
        Valor bruto de hoje que vence em cada mês. Caixinhas e poupança não vencem e ficam no fim.
      </p>
      <ol role="list" className="rf-escada__lista">
        {escada.map((d, i) => (
          <Degrau key={d.mes} d={d} maior={maior} hoje={hoje} abrir={abrir} indice={i} />
        ))}
      </ol>
    </section>
  );
}

function Fatias({
  titulo,
  fatias,
  rotulos,
}: {
  readonly titulo: string;
  readonly fatias: ReturnType<typeof alocacaoPor>;
  readonly rotulos: Readonly<Record<string, string>>;
}) {
  const nome = (k: string) => rotulos[k] ?? k;
  return (
    <Painel titulo={titulo} className="rf-alocacao">
      <div className="rf-alocacao__corpo">
        <Rosca
          fatias={fatias.map((f) => ({ rotulo: nome(f.chave), fracao: f.fracao }))}
          rotulo={`${titulo}: ${fatias.map((f) => `${nome(f.chave)} ${Math.round(f.fracao * 100)}%`).join(", ")}`}
        />
        <Legenda
          itens={fatias.map((f, i) => ({
            nome: nome(f.chave),
            cor: corDe(i),
            valor: `${pct((f.fracao * 100).toFixed(4), { casas: 1 })} · ${reais(f.valor)}`,
          }))}
        />
      </div>
    </Painel>
  );
}

const ORIGEM: Readonly<Record<string, string>> = { manual: "Cadastro manual", pluggy: "Pluggy" };

/** A alocação do que está filtrado (não da carteira toda), por indexador, tipo e origem. */
export function AlocacaoFiltrada({ titulos }: { readonly titulos: readonly TituloRendaFixa[] }) {
  return (
    <div className="rf-grade">
      <Fatias titulo="Por indexador" fatias={alocacaoPor(titulos, (t) => t.indexador)} rotulos={INDEXADOR} />
      <Fatias titulo="Por tipo" fatias={alocacaoPor(titulos, (t) => t.tipo)} rotulos={TIPO} />
      <Fatias titulo="Por origem" fatias={alocacaoPor(titulos, (t) => t.origem)} rotulos={ORIGEM} />
    </div>
  );
}
