import type { MoedaCarteira } from "@zentrade/contratos/esquemas";
import { dec, paraTexto } from "@zentrade/dominio";

/** Uma fatia do donut. `fracao` em texto decimal (exato, para o rótulo); a geometria usa número. */
export interface Fatia {
  readonly rotulo: string;
  readonly fracao: string;
}

const MAXIMO_FATIAS = 6;

/** As moedas com alocação conhecida, da maior para a menor; além do limite, uma fatia "Outras". */
export function fatiasDaAlocacao(moedas: readonly MoedaCarteira[], maximo = MAXIMO_FATIAS): Fatia[] {
  const conhecidas = moedas
    .filter((m): m is MoedaCarteira & { alocacao: string } => m.alocacao !== null && dec(m.alocacao).gt(0))
    .sort((a, b) => dec(b.alocacao).comparedTo(dec(a.alocacao)) || a.ativo.localeCompare(b.ativo))
    .map((m) => ({ rotulo: m.ativo, fracao: m.alocacao }));
  if (conhecidas.length <= maximo) return conhecidas;
  const resto = conhecidas.slice(maximo - 1);
  const soma = resto.reduce((t, f) => t.plus(dec(f.fracao)), dec(0));
  return [
    ...conhecidas.slice(0, maximo - 1),
    { rotulo: `Outras (${resto.length})`, fracao: paraTexto(soma) },
  ];
}

export interface FatiaPosicionada extends Fatia {
  /** Onde a fatia começa e termina na volta (0 a 1). */
  readonly inicio: number;
  readonly fim: number;
}

/** Cada fatia depois da anterior, na ordem dada. */
export function posicionar(fatias: readonly Fatia[]): FatiaPosicionada[] {
  return fatias.reduce<FatiaPosicionada[]>((feitas, f) => {
    const inicio = feitas.at(-1)?.fim ?? 0;
    return [...feitas, { ...f, inicio, fim: inicio + Number(f.fracao) }];
  }, []);
}

const arred = (n: number): number => Math.round(n * 1000) / 1000;

function ponto(cx: number, cy: number, r: number, fracao: number): string {
  // 0 é o topo; cresce no sentido horário.
  const angulo = fracao * 2 * Math.PI - Math.PI / 2;
  return `${arred(cx + r * Math.cos(angulo))} ${arred(cy + r * Math.sin(angulo))}`;
}

/** Caminho SVG de um arco de circunferência entre duas frações da volta (0 a 1). */
export function arco(cx: number, cy: number, r: number, inicio: number, fim: number): string {
  if (fim - inicio >= 0.9999) {
    const meio = ponto(cx, cy, r, inicio + 0.5);
    return `M ${ponto(cx, cy, r, inicio)} A ${r} ${r} 0 1 1 ${meio} A ${r} ${r} 0 1 1 ${ponto(cx, cy, r, inicio)}`;
  }
  const grande = fim - inicio > 0.5 ? 1 : 0;
  return `M ${ponto(cx, cy, r, inicio)} A ${r} ${r} 0 ${grande} 1 ${ponto(cx, cy, r, fim)}`;
}
