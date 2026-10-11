import type { ConversaResumo } from "@zentrade/contratos/esquemas";

/** Como a barra lateral organiza as conversas: por quando foram usadas pela última vez. */
export interface GrupoConversas {
  readonly rotulo: "Hoje" | "Últimos 7 dias" | "Mais antigas";
  readonly conversas: readonly ConversaResumo[];
}

const DIA_MS = 86_400_000;
const DIAS_RECENTES = 7;
const TAMANHO_TITULO = 60;

function inicioDoDia(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function agruparConversas(
  lista: readonly ConversaResumo[],
  agora: number = Date.now(),
): GrupoConversas[] {
  const hoje = inicioDoDia(agora);
  const semana = agora - DIAS_RECENTES * DIA_MS;
  const ordenadas = [...lista].sort((a, b) => b.atualizadaEm - a.atualizadaEm);
  const grupos: GrupoConversas[] = [
    { rotulo: "Hoje", conversas: ordenadas.filter((c) => c.atualizadaEm >= hoje) },
    {
      rotulo: "Últimos 7 dias",
      conversas: ordenadas.filter((c) => c.atualizadaEm < hoje && c.atualizadaEm >= semana),
    },
    { rotulo: "Mais antigas", conversas: ordenadas.filter((c) => c.atualizadaEm < semana) },
  ];
  return grupos.filter((g) => g.conversas.length > 0);
}

/** Minúsculas e sem acento, para "titulos" achar "Títulos". */
const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function filtrarConversas(lista: readonly ConversaResumo[], termo: string): readonly ConversaResumo[] {
  const busca = normalizar(termo);
  if (!busca) return lista;
  return lista.filter((c) => normalizar(`${c.titulo} ${c.previa}`).includes(busca));
}

/** Título de uma conversa nova a partir da primeira pergunta (uma linha, até 60 caracteres). */
export function tituloDaPergunta(pergunta: string): string {
  const linha = pergunta.replace(/\s+/g, " ").trim();
  return linha.length > TAMANHO_TITULO ? `${linha.slice(0, TAMANHO_TITULO - 1).trimEnd()}…` : linha;
}
