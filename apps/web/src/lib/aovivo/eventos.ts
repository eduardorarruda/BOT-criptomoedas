import type { Evento } from "@zentrade/contratos/esquemas";
import type { RegistroAoVivo } from "../../api/esquemas";

/**
 * Eventos ao vivo de um robô: de que categoria são (para os filtros), de que robô
 * são e como juntar o histórico da API com o que chega pelo WebSocket sem repetir.
 */
export type Categoria = "candle" | "sinal" | "analise" | "decisao" | "risco" | "ordem" | "posicao";

export const CATEGORIAS: readonly { readonly valor: Categoria; readonly rotulo: string }[] = [
  { valor: "candle", rotulo: "Candles" },
  { valor: "sinal", rotulo: "Sinais" },
  { valor: "analise", rotulo: "Análises" },
  { valor: "decisao", rotulo: "Decisões" },
  { valor: "risco", rotulo: "Risco" },
  { valor: "ordem", rotulo: "Ordens" },
  { valor: "posicao", rotulo: "Posição" },
];

export const TETO_AO_VIVO = 500;

/** `null` para o que não é de um robô (preço, saúde, configuração) e para alertas (vão para Avisos). */
export function categoriaDe(e: Evento): Categoria | null {
  return e.tipo === "preco" || e.tipo === "saude" || e.tipo === "robo" || e.tipo === "alerta" ? null : e.tipo;
}

/** O robô do evento. A ordem só traz a decisão: o robô vem dela. */
export function roboDoEvento(
  e: Evento,
  roboDaDecisao: (id: string) => string | undefined,
): string | undefined {
  switch (e.tipo) {
    case "analise":
    case "candle":
    case "sinal":
    case "posicao":
    case "risco":
      return e.roboId;
    case "decisao":
      return e.decisao.roboId;
    case "ordem":
      return roboDaDecisao(e.ordem.decisaoId);
    default:
      return undefined;
  }
}

/** Identidade do evento: o mesmo fato vindo do histórico e do WebSocket conta uma vez. */
export function chaveEvento(e: Evento): string {
  switch (e.tipo) {
    case "candle":
      return `candle:${e.roboId}:${e.intervalo}:${e.candle.abertura}`;
    case "sinal":
      return `sinal:${e.roboId}:${e.em}:${e.acao}`;
    case "analise": {
      const fase = e.concluida ? "fim" : e.etapa ? `etapa:${e.etapa.ferramenta}:${e.etapa.em}` : "inicio";
      return `analise:${e.analiseId}:${fase}`;
    }
    case "decisao":
      return `decisao:${e.decisao.id}:${e.decisao.estado}`;
    case "ordem":
      return `ordem:${e.ordem.id}:${e.ordem.estado}:${e.ordem.execucoes.length}`;
    case "risco":
      return `risco:${e.roboId}:${e.barreira.codigo}:${e.em}`;
    case "posicao":
      return `posicao:${e.roboId}:${e.em}:${e.quantidade}`;
    case "preco":
      return `preco:${e.simbolo}:${e.em}`;
    case "saude":
      return `saude:${e.servico}:${e.em}`;
    case "robo":
      return `robo:${e.robo.id}:${e.robo.modo}:${e.robo.pausado}:${e.robo.nome}`;
    case "alerta":
      return `alerta:${e.alerta.chave}:${e.alerta.em}`;
  }
}

/** Junta sem repetir (fica o primeiro que chegou), em ordem de chegada, até o teto. */
export function juntarRegistros(
  atual: readonly RegistroAoVivo[],
  novos: readonly RegistroAoVivo[],
  teto = TETO_AO_VIVO,
): readonly RegistroAoVivo[] {
  const vistos = new Set(atual.map((r) => chaveEvento(r.evento)));
  const entram = novos.filter((r) => {
    const chave = chaveEvento(r.evento);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  // Nada novo: a mesma referência (a loja não avisa ninguém à toa).
  if (entram.length === 0 && atual.length <= teto) return atual;
  return [...atual, ...entram].sort((a, b) => a.recebidoEm - b.recebidoEm).slice(-teto);
}

export interface FiltroAoVivo {
  /** Sem robô: todos. */
  readonly roboId?: string | undefined;
  readonly categorias: ReadonlySet<Categoria>;
}

export function filtrarRegistros(
  registros: readonly RegistroAoVivo[],
  f: FiltroAoVivo,
  roboDaDecisao: (id: string) => string | undefined,
): RegistroAoVivo[] {
  return registros.filter((r) => {
    const categoria = categoriaDe(r.evento);
    if (!categoria || !f.categorias.has(categoria)) return false;
    return !f.roboId || roboDoEvento(r.evento, roboDaDecisao) === f.roboId;
  });
}

/** Decisão → robô, do que já se viu ao vivo e das decisões carregadas. */
export function mapaDecisoes(
  registros: readonly RegistroAoVivo[],
  decisoes: readonly { readonly id: string; readonly roboId: string }[] = [],
): (id: string) => string | undefined {
  const mapa = new Map(decisoes.map((d) => [d.id, d.roboId]));
  for (const r of registros)
    if (r.evento.tipo === "decisao") mapa.set(r.evento.decisao.id, r.evento.decisao.roboId);
  return (id) => mapa.get(id);
}
