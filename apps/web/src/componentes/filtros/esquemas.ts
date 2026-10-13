import { lerLista } from "./logica";
import { PERIODOS } from "./periodo";

/**
 * Validação dos parâmetros de filtro na URL (quem cola um link ou volta no
 * histórico). Cada campo aceita o formato que o roteador entrega e descarta o
 * inválido em silêncio: a página abre com o que dá para entender, nunca quebra.
 * Listas ficam na URL como "A,B", que é legível e curta. Sem Zod de propósito: a
 * validação roda na abertura de toda tela com filtro e entra no pacote inicial.
 */
const LIMITE_BUSCA = 80;
const LIMITE_LISTA = 20;
const DIA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Lê um parâmetro: valor inválido ou ausente vira undefined. */
export type Leitor<T> = (valor: unknown) => T | undefined;
/** O formato da busca de uma tela: um leitor por chave. */
export type EsquemaBusca = Readonly<Record<string, Leitor<unknown>>>;
/** A busca já validada: só as chaves com valor. */
export type BuscaDe<S extends EsquemaBusca> = {
  -readonly [K in keyof S]?: S[K] extends Leitor<infer T> ? T | undefined : never;
};

/** Campo opcional: chave ausente ou valor inválido viram undefined. */
const opcional = <T>(ler: Leitor<T>): Leitor<T> => ler;

const comoTexto = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;

export const campo = {
  /** Texto livre da busca, aparado e curto. */
  busca: () => opcional((v) => comoTexto(v)?.trim().slice(0, LIMITE_BUSCA) || undefined),
  /** Escolha múltipla ("A,B"), na ordem da definição. */
  lista: <T extends string>(permitidos: readonly T[]) =>
    opcional((v) => lerLista(v, permitidos).join(",") || undefined),
  /** Escolha múltipla de valores que vêm da API (ids, símbolos): vale o formato, até 20. */
  listaLivre: (formato: RegExp) =>
    opcional((v) => {
      const partes = (comoTexto(v) ?? "").split(",").map((p) => p.trim());
      const validos = [...new Set(partes.filter((p) => formato.test(p)))].slice(0, LIMITE_LISTA);
      return validos.join(",") || undefined;
    }),
  /** Uma escolha entre poucas. */
  opcao: <T extends string>(permitidos: readonly T[]) =>
    opcional((v): T | undefined => {
      const t = comoTexto(v);
      return t !== undefined && (permitidos as readonly string[]).includes(t) ? (t as T) : undefined;
    }),
  /** Liga/desliga: presente na URL só quando ligado. */
  ligado: () => opcional((v) => (v === true || v === "1" || v === 1 || v === "true" ? true : undefined)),
  /** Data de calendário AAAA-MM-DD que existe. */
  dia: () =>
    opcional((v) => {
      const t = comoTexto(v);
      if (!t || !DIA.test(t)) return undefined;
      const d = new Date(`${t}T00:00:00Z`);
      return d.toISOString().slice(0, 10) === t ? t : undefined;
    }),
  /** Página a partir de 2 (a 1 é o padrão e não aparece). */
  pagina: () =>
    opcional((v) => {
      const n = typeof v === "number" ? v : Number(comoTexto(v));
      return Number.isInteger(n) && n > 1 && n < 10_000 ? n : undefined;
    }),
  periodo: () => campo.opcao(PERIODOS),
};

/** Remove as chaves sem valor, para a URL ficar limpa. */
export function semVazios<T extends Record<string, unknown>>(busca: T): Partial<T> {
  return Object.fromEntries(Object.entries(busca).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Para o `validateSearch` da rota e para o gancho da página: sempre devolve um objeto válido. */
export function validarBusca<S extends EsquemaBusca>(esquema: S) {
  return (bruto: Record<string, unknown>): BuscaDe<S> => {
    const entrada: Readonly<Record<string, unknown>> = bruto ?? {};
    const lidos = Object.entries(esquema).map(([chave, ler]) => [chave, ler(entrada[chave])] as const);
    return Object.fromEntries(lidos.filter(([, v]) => v !== undefined)) as BuscaDe<S>;
  };
}
