import type { DecisaoDTO, EstadoOrdem, OrdemDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { z } from "zod";
import {
  agruparPor,
  campo,
  contemTexto,
  dentroDoPeriodo,
  intervaloDoPeriodo,
  lerLista,
  ordenarPor,
  type Grupo,
} from "../../componentes/filtros";
import { agruparPorDia } from "../../lib/agrupar";
import { taxaTotal } from "../../lib/posicao";
import { ID, SIMBOLO } from "../decisoes/filtros";

/** Filtros das ordens: quem mandou (robô, pela decisão), o quê, quando e como terminou. */
export const LADOS = ["COMPRA", "VENDA"] as const;
export const ESTADOS_ORDEM: readonly EstadoOrdem[] = [
  "PREENCHIDA",
  "PARCIAL",
  "PENDENTE",
  "REJEITADA",
  "CANCELADA",
];
export const ORDENS = ["data", "valor", "taxa"] as const;
export const AGRUPAMENTOS = ["nenhum", "dia", "robo"] as const;

export const buscaOrdens = z.object({
  q: campo.busca(),
  robo: campo.listaLivre(ID),
  simbolo: campo.listaLivre(SIMBOLO),
  lado: campo.lista(LADOS),
  estado: campo.lista(ESTADOS_ORDEM),
  periodo: campo.periodo(),
  de: campo.dia(),
  ate: campo.dia(),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  agrupar: campo.opcao(AGRUPAMENTOS),
  pagina: campo.pagina(),
});
export type BuscaOrdens = Partial<z.output<typeof buscaOrdens>>;

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
