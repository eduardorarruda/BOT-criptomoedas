import { diaNoFuso, inicioDoDiaNoFuso } from "@zentrade/dominio";
import { fusoDaInstancia } from "./fuso";

/** Agrupa itens por dia (fuso da instância), mantendo a ordem: "Hoje", "Ontem" ou a data. */
const nomesDia = new Map<string, Intl.DateTimeFormat>();

function nomeDia(fuso: string): Intl.DateTimeFormat {
  const salvo = nomesDia.get(fuso);
  if (salvo) return salvo;
  const novo = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  nomesDia.set(fuso, novo);
  return novo;
}

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
  const fuso = fusoDaInstancia();
  const hoje = diaNoFuso(agora, fuso);
  // O último instante de ontem: certo também nos dias de 23 e 25 horas.
  const ontem = diaNoFuso(inicioDoDiaNoFuso(agora, fuso) - 1, fuso);
  const grupos: { chave: string; titulo: string; itens: T[] }[] = [];
  for (const item of itens) {
    const ms = em(item);
    const chave = diaNoFuso(ms, fuso);
    let grupo = grupos.at(-1);
    if (grupo?.chave !== chave) {
      const titulo = chave === hoje ? "Hoje" : chave === ontem ? "Ontem" : nomeDia(fuso).format(ms);
      grupo = { chave, titulo, itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(item);
  }
  return grupos;
}
