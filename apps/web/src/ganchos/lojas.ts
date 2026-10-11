import type { RegistroAoVivo } from "../api/esquemas";
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
/** Tudo o que os robôs fizeram desde que a tela abriu (com teto): a tela "Ao vivo" lê daqui. */
export const lojaAoVivo = criarLoja<readonly RegistroAoVivo[]>([]);
/** Hora do último evento recebido: mostra que a conexão está viva de fato. */
export const lojaUltimoEvento = criarLoja<number | null>(null);
