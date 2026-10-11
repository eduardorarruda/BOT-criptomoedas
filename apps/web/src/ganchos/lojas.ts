import type { EstadoConexao } from "../api/fonte";
import { criarLoja } from "../lib/loja";
import type { Analises } from "./atualizarCache";

/** Dados ao vivo que não passam pelo TanStack Query (mudam a cada segundo). */
export interface PrecoAoVivo {
  readonly preco: string;
  readonly anterior: string | null;
  readonly em: number;
}

export interface BarreiraAoVivo {
  readonly roboId: string;
  readonly codigo: string;
  readonly mensagem: string;
  readonly em: number;
}

export const lojaPrecos = criarLoja<Readonly<Record<string, PrecoAoVivo>>>({});
export const lojaAnalises = criarLoja<Analises>({});
export const lojaConexao = criarLoja<EstadoConexao>("desligado");
export const lojaBarreiras = criarLoja<readonly BarreiraAoVivo[]>([]);
