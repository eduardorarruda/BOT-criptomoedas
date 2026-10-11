import type { EstadoIndicador, PontoIndicador } from "@zentrade/banco";
import { SERIES_INDICADOR, type Indicadores, type SerieIndicador } from "@zentrade/contratos";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  FONTE_BCB,
  FONTES_INDICES,
  somarDias,
  somarMeses,
  taxaAnualDeDiaria,
  type Indices,
} from "@zentrade/financas";

/** Lê o cache das séries do BCB e entrega no formato que as contas usam. */
export interface LeitorIndicadores {
  ler(serie: SerieIndicador, desde?: string): Promise<PontoIndicador[]>;
  estado(): Promise<EstadoIndicador[]>;
}

const paraMapa = (pontos: readonly PontoIndicador[], chave: (dia: string) => string = (d) => d) =>
  new Map<string, Valor>(pontos.map((p) => [chave(p.dia), dec(p.valor)]));

/** Um ano antes de `desde`: as premissas (IPCA de 12 meses, último CDI) precisam do passado recente. */
export async function carregarIndices(leitor: LeitorIndicadores, desde: string): Promise<Indices> {
  const inicio = somarMeses(desde, -13);
  const [cdi, selic, ipca, poupanca] = await Promise.all([
    leitor.ler("CDI", inicio),
    leitor.ler("SELIC", inicio),
    leitor.ler("IPCA", inicio),
    leitor.ler("POUPANCA", inicio),
  ]);
  return {
    cdi: paraMapa(cdi),
    selic: paraMapa(selic),
    ipca: paraMapa(ipca, (d) => d.slice(0, 7)),
    poupanca: paraMapa(poupanca),
  };
}

const CEM = dec(100);

function anualizado(serie: SerieIndicador, pontos: readonly PontoIndicador[]): Valor | null {
  const ultimo = pontos.at(-1);
  if (!ultimo) return null;
  if (serie === "CDI" || serie === "SELIC") return taxaAnualDeDiaria(dec(ultimo.valor));
  if (serie === "SELIC_META") return dec(ultimo.valor);
  if (serie !== "IPCA" || pontos.length < 12) return null;
  return pontos
    .slice(-12)
    .reduce((f, p) => f.times(dec(1).plus(dec(p.valor).div(CEM))), dec(1))
    .minus(1)
    .times(CEM);
}

/** O que a tela mostra de cada índice: último valor, data, fonte e quando foi conferido. */
export async function resumirIndicadores(leitor: LeitorIndicadores, hoje: string): Promise<Indicadores> {
  const estado = new Map((await leitor.estado()).map((e) => [e.serie, e]));
  const series = await Promise.all(
    SERIES_INDICADOR.map(async (serie) => {
      const desde = serie === "IPCA" ? somarMeses(hoje, -14) : somarDias(hoje, -45);
      const pontos = (await leitor.ler(serie, desde)).filter((p) => p.dia <= hoje);
      const ultimo = pontos.at(-1) ?? null;
      const anual = anualizado(serie, pontos);
      const e = estado.get(serie);
      const fonte = FONTES_INDICES[serie];
      return {
        serie,
        codigoSgs: fonte.serie,
        nome: fonte.nome,
        unidade: fonte.unidade,
        ultimoDia: ultimo?.dia ?? null,
        ultimoValor: ultimo ? paraTexto(dec(ultimo.valor)) : null,
        anualizado: anual ? paraTexto(anual.toDecimalPlaces(4)) : null,
        verificadoEm: e?.verificadoEm ?? null,
        erro: e?.erro ?? null,
      };
    }),
  );
  return { fonte: FONTE_BCB, series };
}
