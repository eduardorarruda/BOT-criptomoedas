import type {
  EstadoSincronizacaoGravado,
  LinhaTitulo,
  NegociacaoCarteiraLida,
  PontoIndicador,
  RegistroImobiliario,
  SaldoCarteira,
  UltimoFechamento,
} from "@zentrade/banco";
import type { RedeConta, SerieIndicador } from "@zentrade/contratos";
import { dec, paraTexto } from "@zentrade/dominio";
import { z } from "zod";

/**
 * Os investimentos da pessoa que o assistente pode LER. Implementado por
 * criarBancoDoAgente (@zentrade/banco), sob RLS: o usuarioId vem do pedido da API, nunca
 * do modelo. Índices do BCB e candles são públicos (iguais para todos).
 */
export interface LeituraInvestimentos {
  redesCarteira(usuarioId: string): Promise<RedeConta[]>;
  saldosCarteira(usuarioId: string, rede: RedeConta): Promise<SaldoCarteira[]>;
  negociacoesCarteira(usuarioId: string, rede: RedeConta): Promise<NegociacaoCarteiraLida[]>;
  sincronizacaoCarteira(usuarioId: string, rede: RedeConta): Promise<EstadoSincronizacaoGravado | null>;
  ultimosPrecos(simbolos: readonly string[], desde: number): Promise<ReadonlyMap<string, UltimoFechamento>>;
  titulosRendaFixa(usuarioId: string): Promise<LinhaTitulo[]>;
  indicador(serie: SerieIndicador, desde?: string): Promise<PontoIndicador[]>;
  imobiliario(usuarioId: string): Promise<RegistroImobiliario[]>;
}

export interface ContextoInvestimentos {
  readonly usuarioId: string;
  readonly agora: () => number;
}

export const json = (v: unknown): string => JSON.stringify(v);
export const quando = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

const DIA_NO_BRASIL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hoje" da renda fixa e do imobiliário é o dia em Brasília (AAAA-MM-DD), como na tela. */
export const hojeNoBrasil = (ms: number): string => DIA_NO_BRASIL.format(new Date(ms));

/** Fração em texto (0,0523) → percentual com 2 casas ("5.23"); null segue null. */
export const fracaoEmPct = (fracao: string | number | null): string | null =>
  fracao === null ? null : paraTexto(dec(fracao).times(100).toDecimalPlaces(2));

/** Quantas linhas a ferramenta devolve: poucas por padrão, para gastar poucos tokens. */
export const limite = (padrao: number) => z.number().int().min(1).max(50).default(padrao);

/** As primeiras `n` e quantas ficaram de fora. */
export function cortar<T>(lista: readonly T[], n: number): { itens: T[]; omitidos: number } {
  return { itens: lista.slice(0, n), omitidos: Math.max(0, lista.length - n) };
}
