/**
 * Visões salvas: conjuntos de filtros com nome, guardados neste navegador
 * (localStorage, por tela). Sem armazenamento, a lista fica vazia e nada quebra.
 */
export interface VisaoSalva {
  readonly nome: string;
  readonly busca: Readonly<Record<string, unknown>>;
}

const LIMITE = 12;
const chave = (tela: string): string => `zentrade:visoes:${tela}`;

function valida(v: unknown): v is VisaoSalva {
  if (typeof v !== "object" || v === null) return false;
  const { nome, busca } = v as Record<string, unknown>;
  return typeof nome === "string" && nome.length > 0 && typeof busca === "object" && busca !== null;
}

export function lerVisoes(tela: string): VisaoSalva[] {
  try {
    const bruto: unknown = JSON.parse(localStorage.getItem(chave(tela)) ?? "[]");
    return Array.isArray(bruto) ? bruto.filter(valida).slice(0, LIMITE) : [];
  } catch {
    return [];
  }
}

function gravar(tela: string, visoes: readonly VisaoSalva[]): VisaoSalva[] {
  try {
    localStorage.setItem(chave(tela), JSON.stringify(visoes));
  } catch {
    // sem armazenamento (navegação privada, cota cheia): vale só até recarregar
  }
  return [...visoes];
}

/** Salvar com um nome que já existe substitui; a mais nova fica primeiro. */
export function salvarVisao(
  tela: string,
  nome: string,
  busca: Readonly<Record<string, unknown>>,
): VisaoSalva[] {
  const limpo = nome.trim().slice(0, 40);
  if (!limpo) return lerVisoes(tela);
  const outras = lerVisoes(tela).filter((v) => v.nome !== limpo);
  return gravar(tela, [{ nome: limpo, busca }, ...outras].slice(0, LIMITE));
}

export function apagarVisao(tela: string, nome: string): VisaoSalva[] {
  return gravar(
    tela,
    lerVisoes(tela).filter((v) => v.nome !== nome),
  );
}
