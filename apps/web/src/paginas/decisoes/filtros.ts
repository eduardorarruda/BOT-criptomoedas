import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import {
  agruparPor,
  contemTexto,
  dentroDoPeriodo,
  intervaloDoPeriodo,
  lerLista,
  ordenarPor,
  type Grupo,
} from "../../componentes/filtros";
import { agruparPorDia } from "../../lib/agrupar";
import { ACOES, ESTADOS, DESFECHOS, type Desfecho, type BuscaDecisoes } from "./busca";

export * from "./busca";

/**
 * Filtros do diário de decisões: o que a URL guarda, como cada filtro decide e
 * como a lista é ordenada e agrupada. Tudo puro, testado sem tela.
 */

const livre = (v: string | undefined): string[] => (v ? v.split(",") : []);

/** Ganho, perda ou sem desfecho avaliado ainda. */
export function desfechoDe(d: DecisaoDTO): Desfecho {
  if (!d.desfecho) return "sem";
  const r = dec(d.desfecho.resultado);
  return r.isNegative() ? "perda" : r.isZero() ? "sem" : "ganho";
}

/** Preço × quantidade (null quando a decisão não tem tamanho). */
export function valorDe(d: DecisaoDTO): number | null {
  return d.quantidade ? dec(d.preco).times(d.quantidade).toNumber() : null;
}

export interface Contexto {
  readonly robos: readonly RoboDTO[];
  readonly agora: number;
}

/** Só os filtros que estão valendo, cada um com o nome do parâmetro (para a contagem facetada). */
export function predicadosDecisoes(
  b: BuscaDecisoes,
  { robos, agora }: Contexto,
): Record<string, (d: DecisaoDTO) => boolean> {
  const p: Record<string, (d: DecisaoDTO) => boolean> = {};
  const robo = livre(b.robo);
  const simbolo = livre(b.simbolo);
  const acao = lerLista(b.acao, ACOES);
  const estado = lerLista(b.estado, ESTADOS);
  const desfecho = lerLista(b.desfecho, DESFECHOS);
  const intervalo = intervaloDoPeriodo(b, agora);
  const nome = (id: string) => robos.find((r) => r.id === id)?.nome;
  if (b.q)
    p.q = (d) =>
      contemTexto(b.q, [
        d.sinal.explicacao,
        d.proposta?.justificativa,
        ...(d.proposta?.riscos ?? []),
        ...d.risco.barreiras.map((x) => x.mensagem),
        nome(d.roboId),
        robos.find((r) => r.id === d.roboId)?.simbolo,
      ]);
  if (robo.length) p.robo = (d) => robo.includes(d.roboId);
  if (simbolo.length)
    p.simbolo = (d) => simbolo.includes(robos.find((r) => r.id === d.roboId)?.simbolo ?? "");
  if (acao.length) p.acao = (d) => acao.includes(d.sinal.acao);
  if (estado.length) p.estado = (d) => estado.includes(d.estado);
  if (desfecho.length) p.desfecho = (d) => desfecho.includes(desfechoDe(d));
  if (intervalo) p.periodo = (d) => dentroDoPeriodo(d.em, intervalo);
  return p;
}

export function ordenarDecisoes(ds: readonly DecisaoDTO[], b: BuscaDecisoes): DecisaoDTO[] {
  const dir = b.dir ?? "desc";
  switch (b.ordem) {
    case "valor":
      return ordenarPor(ds, valorDe, dir);
    case "resultado":
      return ordenarPor(ds, (d) => (d.desfecho ? Number(d.desfecho.resultado) : null), dir);
    case "custo":
      return ordenarPor(ds, (d) => (d.custoIaUsd ? Number(d.custoIaUsd) : null), dir);
    default:
      return ordenarPor(ds, (d) => d.em, dir);
  }
}

export function agruparDecisoes(
  ds: readonly DecisaoDTO[],
  b: BuscaDecisoes,
  { robos, agora }: Contexto,
): Grupo<DecisaoDTO>[] {
  const modo = b.agrupar ?? "dia";
  // Agrupar por dia só faz sentido com a lista em ordem de data.
  if (modo === "dia" && (b.ordem ?? "data") === "data") return agruparPorDia(ds, (d) => d.em, agora);
  if (modo === "robo")
    return agruparPor(
      ds,
      (d) => d.roboId,
      (id) => robos.find((r) => r.id === id)?.nome ?? id,
    );
  return [{ chave: "todas", titulo: "", itens: ds }];
}

export interface ResumoDecisoes {
  readonly total: number;
  readonly executadas: number;
  readonly comDesfecho: number;
  readonly resultado: string;
  readonly custoIa: string;
}

/** Totais que seguem o filtro: quantas, quantas executadas, resultado avaliado e custo de IA. */
export function resumirDecisoes(ds: readonly DecisaoDTO[]): ResumoDecisoes {
  const somar = (xs: readonly string[]) => xs.reduce((s, x) => s.plus(x), dec(0)).toFixed(2);
  const avaliadas = ds.flatMap((d) => (d.desfecho ? [d.desfecho.resultado] : []));
  return {
    total: ds.length,
    executadas: ds.filter((d) => d.estado === "executada").length,
    comDesfecho: avaliadas.length,
    resultado: somar(avaliadas),
    custoIa: ds.reduce((s, d) => s.plus(d.custoIaUsd ?? "0"), dec(0)).toFixed(4),
  };
}
