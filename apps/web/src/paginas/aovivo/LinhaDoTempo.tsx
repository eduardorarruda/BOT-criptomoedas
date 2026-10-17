import type { RoboDTO } from "@zentrade/contratos/esquemas";
import {
  Activity,
  ArrowLeftRight,
  Bot,
  ChartCandlestick,
  ListTree,
  Radio,
  ScrollText,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useMemo, useState } from "react";
import type { RegistroAoVivo } from "../../api/esquemas";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { useAgora } from "../../ganchos/useAgora";
import { descrever } from "../../lib/aovivo/descrever";
import { CATEGORIAS, categoriaDe, chaveEvento, type Categoria } from "../../lib/aovivo/eventos";
import { formatarDataHora, formatarHora } from "../../lib/tempo";

const DOZE_HORAS = 12 * 3_600_000;
/** Hora com segundos para o que é de agora; data e hora para o que é de antes. */
const quando = (ms: number, agora: number): string =>
  agora - ms < DOZE_HORAS ? formatarHora(ms) : formatarDataHora(ms);

const ICONE: Record<Categoria, LucideIcon> = {
  candle: ChartCandlestick,
  sinal: ListTree,
  analise: Bot,
  decisao: ScrollText,
  risco: ShieldAlert,
  ordem: ArrowLeftRight,
  posicao: Wallet,
};
const PASSO_LISTA = 40;
const TODAS: ReadonlySet<Categoria> = new Set(CATEGORIAS.map((c) => c.valor));

interface Props {
  readonly registros: readonly RegistroAoVivo[];
  readonly robos: readonly RoboDTO[];
  readonly mostrarRobo: boolean;
  readonly carregando: boolean;
  readonly erro: unknown;
  readonly tentarDeNovo: () => void;
  readonly roboDe: (r: RegistroAoVivo) => string | undefined;
}

function Filtros(props: {
  readonly ativas: ReadonlySet<Categoria>;
  readonly contagem: ReadonlyMap<Categoria, number>;
  readonly alternar: (c: Categoria) => void;
}) {
  return (
    <div className="filtros-eventos" role="group" aria-label="Mostrar na linha do tempo">
      {CATEGORIAS.map((c) => {
        const Icone = ICONE[c.valor];
        return (
          <button
            key={c.valor}
            type="button"
            className="filtro-evento"
            aria-pressed={props.ativas.has(c.valor)}
            onClick={() => props.alternar(c.valor)}
          >
            <Icone size={14} aria-hidden="true" />
            {c.rotulo}
            <span className="num apagado">{props.contagem.get(c.valor) ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

function Item({
  r,
  robo,
  agora,
}: {
  readonly r: RegistroAoVivo;
  readonly robo: RoboDTO | undefined;
  readonly agora: number;
}) {
  const d = descrever(r.evento);
  if (!d) return null;
  const Icone = ICONE[d.categoria];
  return (
    <>
      <span className={`evento__icone evento__icone--${d.tom}`} aria-hidden="true">
        <Icone size={14} />
      </span>
      <div className="evento__texto">
        <p className="evento__titulo">
          {d.titulo}
          {robo ? <span className="apagado"> · {robo.nome}</span> : null}
        </p>
        {d.detalhe ? <p className="evento__detalhe">{d.detalhe}</p> : null}
      </div>
      <time className="evento__hora num apagado" dateTime={new Date(r.recebidoEm).toISOString()}>
        {quando(r.recebidoEm, agora)}
      </time>
    </>
  );
}

/** Tudo o que o robô fez, do mais novo ao mais antigo, com filtros por tipo. */
export function LinhaDoTempo(p: Props) {
  const [ativas, setAtivas] = useState<ReadonlySet<Categoria>>(TODAS);
  const [limite, setLimite] = useState(PASSO_LISTA);
  const agora = useAgora(60_000);
  const contagem = useMemo(() => {
    const c = new Map<Categoria, number>();
    for (const r of p.registros) {
      const cat = categoriaDe(r.evento);
      if (cat) c.set(cat, (c.get(cat) ?? 0) + 1);
    }
    return c;
  }, [p.registros]);
  const visiveis = useMemo(
    () => p.registros.filter((r) => ativas.has(categoriaDe(r.evento) ?? "candle")).toReversed(),
    [p.registros, ativas],
  );
  const alternar = (c: Categoria): void =>
    setAtivas((a) => (a.has(c) ? new Set([...a].filter((x) => x !== c)) : new Set([...a, c])));

  return (
    <Painel titulo="Linha do tempo" id="titulo-linha-tempo" className="aovivo-linha" icone={Activity}>
      <Filtros ativas={ativas} contagem={contagem} alternar={alternar} />
      {p.erro ? <ErroCarregar compacto erro={p.erro} tentarDeNovo={p.tentarDeNovo} /> : null}
      {p.carregando ? (
        <Esqueleto forma="lista" linhas={5} rotulo="Carregando o que aconteceu há pouco" />
      ) : null}
      {!p.carregando && visiveis.length === 0 ? (
        <EstadoVazio
          icone={Radio}
          titulo={p.registros.length ? "Nada com esses filtros" : "Silêncio por enquanto"}
        >
          {p.registros.length
            ? "Ligue mais tipos de evento acima para ver o resto."
            : "Quando o robô fechar o próximo candle, ele aparece aqui, com o sinal da regra, a análise da IA, o risco e a ordem, se houver."}
        </EstadoVazio>
      ) : null}
      <ol
        role="list"
        className="eventos"
        aria-labelledby="titulo-linha-tempo"
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- lista rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
        tabIndex={0}
      >
        <AnimatePresence initial={false}>
          {visiveis.slice(0, limite).map((r) => {
            const roboId = p.mostrarRobo ? p.roboDe(r) : undefined;
            return (
              <m.li
                key={`${chaveEvento(r.evento)}`}
                layout="position"
                className="evento"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <Item r={r} robo={roboId ? p.robos.find((x) => x.id === roboId) : undefined} agora={agora} />
              </m.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {visiveis.length > limite ? (
        <Botao variante="fantasma" pequeno onClick={() => setLimite((l) => l + PASSO_LISTA)}>
          Mostrar mais {Math.min(PASSO_LISTA, visiveis.length - limite)}
        </Botao>
      ) : null}
    </Painel>
  );
}
