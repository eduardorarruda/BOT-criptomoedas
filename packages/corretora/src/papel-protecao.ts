import type {
  EstadoOrdem,
  IdsProtecao,
  PedidoProtecao,
  PernaProtecao,
  ResultadoProtecao,
} from "@zentrade/contratos";
import { dec, formatarNumero, type Candle, type Execucao, type Valor } from "@zentrade/dominio";

/** Proteção (stop-limit ou OCO) no livro do papel. */
export interface ProtecaoPapel {
  readonly pedido: PedidoProtecao;
  readonly idCorretora: string;
  /** Candles que terminaram antes disto não disparam nada: a proteção ainda não existia. */
  readonly criadaEm: number;
  /** O stop disparou com o preço abaixo do limite (gap): a venda espera o preço voltar ao limite. */
  readonly disparada: boolean;
  readonly resultado: ResultadoProtecao;
}

export type Gatilho =
  { readonly perna: "stop" | "alvo"; readonly preco: Valor } | { readonly disparou: true } | null;

const maior = (a: Valor, b: Valor): Valor => (a.gt(b) ? a : b);

/**
 * O que um candle faz com a proteção no livro. O papel não vê os negócios dentro do
 * candle, só abertura, mínima e máxima; as regras escolhem o caso mais conservador:
 * - Alvo (LIMIT_MAKER): máxima no alvo executa no alvo, sem deslizamento (ordem no livro).
 * - Stop: mínima no stop dispara. Abriu acima do stop (cruzou dentro do candle): vende no
 *   stop menos o deslizamento, nunca abaixo do limite. Abriu abaixo do stop (gap): vende
 *   na abertura menos o deslizamento se ainda estiver no limite ou acima; senão a venda
 *   fica no limite e só executa quando a máxima chegar a ele.
 * - Tocou os dois no mesmo candle: vale o stop (o pior caso), a não ser que já tenha
 *   aberto no alvo.
 */
export function gatilhoNoCandle(p: ProtecaoPapel, c: Candle, deslizamento: Valor): Gatilho {
  if (c.fechamento <= p.criadaEm) return null;
  const { stop, limite, alvo } = p.pedido;
  if (p.disparada) return c.maxima.gte(limite) ? { perna: "stop", preco: limite } : null;
  const tocouStop = c.minima.lte(stop);
  if (alvo && c.maxima.gte(alvo) && (!tocouStop || c.abre.gte(alvo))) return { perna: "alvo", preco: alvo };
  if (!tocouStop) return null;
  const referencia = c.abre.gt(stop) ? stop : c.abre;
  if (referencia.gte(limite))
    return { perna: "stop", preco: maior(limite, referencia.times(dec(1).minus(deslizamento))) };
  return c.maxima.gte(limite) ? { perna: "stop", preco: limite } : { disparou: true };
}

/** Por que a corretora recusaria a proteção agora (preços), ou null. Quantidade e saldo ficam com o papel. */
export function problemaDosPrecos(p: PedidoProtecao, preco: Valor): string | null {
  if (p.stop.gte(preco))
    return `O stop (${formatarNumero(p.stop)}) está no preço de agora (${formatarNumero(preco)}) ou acima: a ordem dispararia na hora.`;
  if (p.limite.gt(p.stop))
    return `O preço limite (${formatarNumero(p.limite)}) precisa ficar no stop (${formatarNumero(p.stop)}) ou abaixo dele.`;
  if (p.alvo && p.alvo.lte(preco))
    return `O alvo (${formatarNumero(p.alvo)}) precisa ficar acima do preço de agora (${formatarNumero(preco)}).`;
  return null;
}

function pernasDe(ids: IdsProtecao, estado: EstadoOrdem): PernaProtecao[] {
  const perna = (nome: "stop" | "alvo", idCliente: string): PernaProtecao => ({
    perna: nome,
    ordem: { idCliente, idCorretora: null, estado, execucoes: [] },
  });
  return [perna("stop", ids.stop), ...(ids.alvo ? [perna("alvo", ids.alvo)] : [])];
}

export const protecaoAtiva = (pedido: PedidoProtecao, idCorretora: string): ResultadoProtecao => ({
  estado: "ATIVA",
  idCorretora,
  pernas: pernasDe(pedido.ids, "PENDENTE"),
});

export const protecaoRejeitada = (ids: IdsProtecao, motivo: string): ResultadoProtecao => ({
  estado: "REJEITADA",
  idCorretora: null,
  pernas: pernasDe(ids, "REJEITADA"),
  motivo,
});

/** Tudo o que ainda estava no livro vira CANCELADA. */
export function protecaoCancelada(r: ResultadoProtecao): ResultadoProtecao {
  if (r.estado !== "ATIVA") return r;
  return {
    ...r,
    estado: "CANCELADA",
    pernas: r.pernas.map((p) =>
      p.ordem.estado === "PENDENTE" ? { ...p, ordem: { ...p.ordem, estado: "CANCELADA" as const } } : p,
    ),
  };
}

/** Uma perna executou por inteiro; a outra (OCO) é cancelada pela corretora. */
export function protecaoExecutada(
  r: ResultadoProtecao,
  perna: "stop" | "alvo",
  execucao: Execucao,
  idCorretora: string,
): ResultadoProtecao {
  return {
    ...r,
    estado: "EXECUTADA",
    pernas: r.pernas.map((p) =>
      p.perna === perna
        ? { ...p, ordem: { ...p.ordem, idCorretora, estado: "PREENCHIDA" as const, execucoes: [execucao] } }
        : { ...p, ordem: { ...p.ordem, estado: "CANCELADA" as const } },
    ),
  };
}
