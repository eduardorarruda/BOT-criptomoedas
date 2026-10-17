/**
 * Comandos da paleta (Ctrl/Cmd+Shift+P ou "/"): ir para uma tela ou fazer uma ação.
 * A busca ignora acento e caixa, exige todas as palavras e põe primeiro o que começa
 * com o termo. Sem dependência do menu: a paleta (lazy) não arrasta os ícones.
 */
export type GrupoComando = "Ir para" | "Ações";

export interface Comando {
  readonly id: string;
  readonly titulo: string;
  readonly grupo: GrupoComando;
  /** Sinônimos que a busca também aceita ("parar tudo" acha Risco). */
  readonly palavras?: string;
  /** Atalho mostrado ao lado ("g r"). */
  readonly atalho?: string;
  readonly executar: () => void;
}

const normalizar = (t: string): string =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

function pontuar(c: Comando, termos: readonly string[], inteiro: string): number | null {
  const titulo = normalizar(c.titulo);
  const tudo = `${titulo} ${normalizar(c.grupo)} ${normalizar(c.palavras ?? "")}`;
  if (!termos.every((t) => tudo.includes(t))) return null;
  if (titulo.startsWith(inteiro)) return 0;
  if (titulo.split(/\s+/).some((p) => p.startsWith(termos[0] ?? ""))) return 1;
  if (titulo.includes(inteiro)) return 2;
  return 3;
}

export function filtrarComandos(comandos: readonly Comando[], termo: string): Comando[] {
  const inteiro = normalizar(termo);
  if (!inteiro) return [...comandos];
  const termos = inteiro.split(/\s+/);
  return comandos
    .map((c, i) => ({ c, i, p: pontuar(c, termos, inteiro) }))
    .filter((x): x is { c: Comando; i: number; p: number } => x.p !== null)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.c);
}
