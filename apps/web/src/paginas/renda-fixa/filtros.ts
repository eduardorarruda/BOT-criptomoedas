import {
  INDEXADORES,
  LIQUIDEZES,
  ORIGENS_TITULO,
  TIPOS_TITULO,
  type TituloRendaFixa,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { z } from "zod";
import {
  agruparPor,
  CHAVES_DE_VISAO,
  campo,
  contemTexto,
  lerLista,
  ordenarPor,
} from "../../componentes/filtros";

/**
 * Filtros da lista de títulos: tipo, indexador, origem, liquidez, janela de
 * vencimento e situação; ordem e as visões (cartões, tabela, escada de
 * vencimentos, alocação). Tudo puro e testado sem tela.
 */
export const ABAS = ["visao", "titulos", "conectar", "cadastrar", "simuladores"] as const;
export type Aba = (typeof ABAS)[number];
export const JANELAS = ["30", "90", "365"] as const;
export const SITUACOES = ["ativo", "encerrado"] as const;
export const ORDENS = ["vencimento", "valor", "rendimento", "aplicacao", "nome"] as const;
export const VISOES = ["cartoes", "tabela", "escada", "alocacao"] as const;

export const buscaRendaFixa = z.object({
  aba: campo.opcao(ABAS),
  q: campo.busca(),
  tipo: campo.lista(TIPOS_TITULO),
  indexador: campo.lista(INDEXADORES),
  origem: campo.lista(ORIGENS_TITULO),
  liquidez: campo.lista(LIQUIDEZES),
  vence: campo.opcao(JANELAS),
  situacao: campo.opcao(SITUACOES),
  ordem: campo.opcao(ORDENS),
  dir: campo.opcao(["asc", "desc"] as const),
  visao: campo.opcao(VISOES),
  densidade: campo.opcao(["compacta"] as const),
});
export type BuscaRendaFixa = Partial<z.output<typeof buscaRendaFixa>>;

/** A aba também mora na URL, mas trocar de aba não é filtro. */
export const NAO_CONTAM: readonly string[] = [...CHAVES_DE_VISAO, "aba"];

const DIA_MS = 86_400_000;

/** "AAAA-MM-DD" do instante, no horário local. */
export function diaLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dias corridos de `hoje` até `dia` (negativo se já passou). */
export function diasAte(dia: string, hoje: string): number {
  return Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / DIA_MS);
}

/** Venceu: a posição diz ou a data já passou. */
export function encerrado(t: TituloRendaFixa, hoje: string): boolean {
  return (t.posicao.disponivel && t.posicao.vencido) || (t.vencimento !== null && t.vencimento < hoje);
}

/** Bruto de hoje; sem posição, o aplicado (para ordenar e somar sem sumir com o título). */
export function valorDe(t: TituloRendaFixa): number {
  return Number(t.posicao.disponivel ? t.posicao.bruto : t.valorAplicado);
}

export function predicadosRendaFixa(
  b: BuscaRendaFixa,
  hoje: string,
): Record<string, (t: TituloRendaFixa) => boolean> {
  const p: Record<string, (t: TituloRendaFixa) => boolean> = {};
  const tipo = lerLista(b.tipo, TIPOS_TITULO);
  const indexador = lerLista(b.indexador, INDEXADORES);
  const origem = lerLista(b.origem, ORIGENS_TITULO);
  const liquidez = lerLista(b.liquidez, LIQUIDEZES);
  if (b.q) p.q = (t) => contemTexto(b.q, [t.nome, t.emissor, t.tipo, t.indexador]);
  if (tipo.length) p.tipo = (t) => tipo.includes(t.tipo);
  if (indexador.length) p.indexador = (t) => indexador.includes(t.indexador);
  if (origem.length) p.origem = (t) => origem.includes(t.origem);
  if (liquidez.length) p.liquidez = (t) => liquidez.includes(t.liquidez);
  if (b.vence) {
    const limite = Number(b.vence);
    p.vence = (t) => t.vencimento !== null && !encerrado(t, hoje) && diasAte(t.vencimento, hoje) <= limite;
  }
  if (b.situacao) p.situacao = (t) => encerrado(t, hoje) === (b.situacao === "encerrado");
  return p;
}

export function ordenarTitulos(ts: readonly TituloRendaFixa[], b: BuscaRendaFixa): TituloRendaFixa[] {
  const ordem = b.ordem ?? "vencimento";
  const dir = b.dir ?? (ordem === "vencimento" || ordem === "nome" ? "asc" : "desc");
  switch (ordem) {
    case "valor":
      return ordenarPor(ts, valorDe, dir);
    case "rendimento":
      return ordenarPor(
        ts,
        (t) => (t.posicao.disponivel ? Number(t.posicao.rentabilidadeBrutaPct) : null),
        dir,
      );
    case "aplicacao":
      return ordenarPor(ts, (t) => t.dataAplicacao, dir);
    case "nome":
      return ordenarPor(ts, (t) => t.nome, dir);
    default:
      return ordenarPor(ts, (t) => t.vencimento, dir);
  }
}

/** Soma exata (decimal) do bruto de hoje, ou do aplicado sem posição, em texto com 2 casas. */
function somarValores(ts: readonly TituloRendaFixa[]): string {
  return ts
    .reduce((s, t) => s.plus(t.posicao.disponivel ? t.posicao.bruto : t.valorAplicado), dec(0))
    .toFixed(2);
}

export interface DegrauVencimento {
  /** "2027-02" ou "sem" (caixinha, poupança). */
  readonly mes: string;
  readonly titulos: readonly TituloRendaFixa[];
  /** Em texto decimal (2 casas). */
  readonly valor: string;
  readonly passado: boolean;
}

/** Escada de vencimentos: um degrau por mês, do mais perto ao mais longe; os sem data no fim. */
export function escadaDeVencimentos(ts: readonly TituloRendaFixa[], hoje: string): DegrauVencimento[] {
  const comData = ordenarPor(
    ts.filter((t) => t.vencimento !== null),
    (t) => t.vencimento,
    "asc",
  );
  const semData = ts.filter((t) => t.vencimento === null);
  const grupos = agruparPor(comData, (t) => (t.vencimento ?? "").slice(0, 7));
  const degraus = grupos.map((g) => ({
    mes: g.chave,
    titulos: g.itens,
    valor: somarValores(g.itens),
    passado: g.chave < hoje.slice(0, 7) || g.itens.every((t) => encerrado(t, hoje)),
  }));
  if (semData.length === 0) return degraus;
  return [...degraus, { mes: "sem", titulos: semData, valor: somarValores(semData), passado: false }];
}

export interface FatiaAlocacao {
  readonly chave: string;
  readonly valor: string;
  readonly fracao: number;
}

/** Alocação do que está filtrado, pelo bruto de hoje (ou o aplicado, sem posição). */
export function alocacaoPor(
  ts: readonly TituloRendaFixa[],
  chave: (t: TituloRendaFixa) => string,
): FatiaAlocacao[] {
  const somas = new Map<string, ReturnType<typeof dec>>();
  for (const t of ts) {
    const v = t.posicao.disponivel ? t.posicao.bruto : t.valorAplicado;
    somas.set(chave(t), (somas.get(chave(t)) ?? dec(0)).plus(v));
  }
  const total = [...somas.values()].reduce((s, v) => s.plus(v), dec(0));
  return [...somas.entries()]
    .map(([k, v]) => ({
      chave: k,
      valor: v.toFixed(2),
      fracao: total.isZero() ? 0 : v.div(total).toNumber(),
    }))
    .sort((a, b) => b.fracao - a.fracao);
}
