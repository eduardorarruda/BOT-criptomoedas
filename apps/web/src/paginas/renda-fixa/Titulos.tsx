import type { TituloRendaFixa } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import {
  Building2,
  ChevronRight,
  Layers,
  PencilLine,
  PlugZap,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { m } from "motion/react";
import { Botao } from "../../componentes/Botao";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { useMenosMovimento } from "../../ganchos/movimento";
import { useTitulosRF } from "./consultas";
import { data, LIQUIDEZ, pct, reais, rentabilidadeContratada, TIPO, tomDe } from "./formato";
import type { Aba } from "./RendaFixa";

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

export function Titulos({
  irPara,
  abrir,
}: {
  readonly irPara: (a: Aba) => void;
  readonly abrir: (id: string) => void;
}) {
  const { data: titulos, error, isPending, refetch } = useTitulosRF();
  const menos = useMenosMovimento();
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
  return (
    <ul className="rf-lista" role="list">
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
