import type { DecisaoDTO, OrdemDTO, RoboDTO } from "@zentrade/contratos/esquemas";
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
import { taxaTotal } from "../../lib/posicao";
import { LADOS, ESTADOS_ORDEM, type BuscaOrdens } from "./busca";

export * from "./busca";

/** Filtros das ordens: quem mandou (robô, pela decisão), o quê, quando e como terminou. */

export interface ContextoOrdens {
  readonly robos: readonly RoboDTO[];
  readonly decisoes: readonly DecisaoDTO[];
  readonly agora: number;
}

/** O robô de uma ordem vem da decisão que a originou. */
export function roboDaOrdem(
  o: OrdemDTO,
  ctx: Pick<ContextoOrdens, "robos" | "decisoes">,
): RoboDTO | undefined {
  const roboId = ctx.decisoes.find((d) => d.id === o.decisaoId)?.roboId;
  return ctx.robos.find((r) => r.id === roboId);
}

/** Valor executado: soma de preço × quantidade das execuções (0 se nada executou). */
export function valorExecutado(o: OrdemDTO): number {
  return o.execucoes.reduce((t, e) => t.plus(dec(e.preco).times(e.quantidade)), dec(0)).toNumber();
}

const livre = (v: string | undefined): string[] => (v ? v.split(",") : []);

export function predicadosOrdens(
  b: BuscaOrdens,
  ctx: ContextoOrdens,
): Record<string, (o: OrdemDTO) => boolean> {
  const p: Record<string, (o: OrdemDTO) => boolean> = {};
  const robo = livre(b.robo);
  const simbolo = livre(b.simbolo);
  const lado = lerLista(b.lado, LADOS);
  const estado = lerLista(b.estado, ESTADOS_ORDEM);
  const intervalo = intervaloDoPeriodo(b, ctx.agora);
  if (b.q) p.q = (o) => contemTexto(b.q, [o.simbolo, o.motivo, o.idCliente, roboDaOrdem(o, ctx)?.nome]);
  if (robo.length) p.robo = (o) => robo.includes(roboDaOrdem(o, ctx)?.id ?? "");
  if (simbolo.length) p.simbolo = (o) => simbolo.includes(o.simbolo);
  if (lado.length) p.lado = (o) => lado.includes(o.lado);
  if (estado.length) p.estado = (o) => estado.includes(o.estado);
  if (intervalo) p.periodo = (o) => dentroDoPeriodo(o.criadaEm, intervalo);
  return p;
}

export function ordenarOrdens(os: readonly OrdemDTO[], b: BuscaOrdens): OrdemDTO[] {
  const dir = b.dir ?? "desc";
  if (b.ordem === "valor") return ordenarPor(os, (o) => (o.execucoes.length ? valorExecutado(o) : null), dir);
  if (b.ordem === "taxa")
    return ordenarPor(os, (o) => (o.execucoes.length ? Number(taxaTotal(o.execucoes)) : null), dir);
  return ordenarPor(os, (o) => o.criadaEm, dir);
}

export function agruparOrdens(
  os: readonly OrdemDTO[],
  b: BuscaOrdens,
  ctx: ContextoOrdens,
): Grupo<OrdemDTO>[] {
  if (b.agrupar === "dia" && (b.ordem ?? "data") === "data")
    return agruparPorDia(os, (o) => o.criadaEm, ctx.agora);
  if (b.agrupar === "robo")
    return agruparPor(
      os,
      (o) => roboDaOrdem(o, ctx)?.id ?? "?",
      (_, o) => roboDaOrdem(o, ctx)?.nome ?? "Robô removido",
    );
  return [{ chave: "todas", titulo: "", itens: os }];
}

export interface ResumoOrdens {
  readonly total: number;
  readonly preenchidas: number;
  readonly rejeitadas: number;
  readonly valor: string;
  readonly taxas: string;
}

export function resumirOrdens(os: readonly OrdemDTO[]): ResumoOrdens {
  const execucoes = os.flatMap((o) => o.execucoes);
  return {
    total: os.length,
    preenchidas: os.filter((o) => o.estado === "PREENCHIDA").length,
    rejeitadas: os.filter((o) => o.estado === "REJEITADA").length,
    valor: execucoes.reduce((t, e) => t.plus(dec(e.preco).times(e.quantidade)), dec(0)).toFixed(2),
    taxas: dec(taxaTotal(execucoes)).toFixed(4),
  };
}
