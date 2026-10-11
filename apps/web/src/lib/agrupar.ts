/** Agrupa itens por dia (fuso de São Paulo), mantendo a ordem: "Hoje", "Ontem" ou a data. */
const FUSO = "America/Sao_Paulo";
const chaveDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const nomeDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "2-digit",
  month: "long",
});

export interface GrupoDia<T> {
  readonly chave: string;
  readonly titulo: string;
  readonly itens: readonly T[];
}

export function agruparPorDia<T>(
  itens: readonly T[],
  em: (item: T) => number,
  agora: number = Date.now(),
): GrupoDia<T>[] {
  const hoje = chaveDia.format(agora);
  const ontem = chaveDia.format(agora - 86_400_000);
  const grupos: { chave: string; titulo: string; itens: T[] }[] = [];
  for (const item of itens) {
    const ms = em(item);
    const chave = chaveDia.format(ms);
    let grupo = grupos.at(-1);
    if (grupo?.chave !== chave) {
      const titulo = chave === hoje ? "Hoje" : chave === ontem ? "Ontem" : nomeDia.format(ms);
      grupo = { chave, titulo, itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(item);
  }
  return grupos;
}
