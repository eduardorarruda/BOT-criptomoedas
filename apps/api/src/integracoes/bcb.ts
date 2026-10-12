import { z } from "zod";

/**
 * Cliente do SGS (Sistema Gerenciador de Séries Temporais) do Banco Central, a API
 * pública de dados abertos. Só leitura, sem chave. As séries diárias aceitam no
 * máximo 10 anos por consulta, então períodos longos viram várias consultas.
 */
export const URL_SGS = "https://api.bcb.gov.br/dados/serie";
const TEMPO_LIMITE_MS = 20_000;
const ANOS_POR_CONSULTA = 9;

export interface PontoSgs {
  /** "AAAA-MM-DD". */
  readonly dia: string;
  readonly valor: string;
  readonly diaFim: string | null;
}

export interface ClienteBcb {
  serie(codigo: number, de: string, ate: string): Promise<PontoSgs[]>;
}

export class ErroBcb extends Error {
  override name = "ErroBcb";
}

const DataBr = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/);
const RespostaSgs = z.array(
  z.object({
    data: DataBr,
    valor: z.string().regex(/^-?\d+(\.\d+)?$/),
    dataFim: DataBr.optional(),
  }),
);

const paraIso = (br: string): string => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;
const paraBr = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Quebra [de, ate] em janelas de até 9 anos (o SGS recusa mais de 10 para séries diárias). */
export function janelas(de: string, ate: string): [string, string][] {
  const resultado: [string, string][] = [];
  for (let inicio = de; inicio <= ate;) {
    const ano = Number(inicio.slice(0, 4)) + ANOS_POR_CONSULTA;
    const limite = `${ano}${inicio.slice(4, 10)}`;
    const fim = limite < ate ? limite : ate;
    resultado.push([inicio, fim]);
    const proximo = new Date(`${fim}T00:00:00Z`);
    proximo.setUTCDate(proximo.getUTCDate() + 1);
    inicio = proximo.toISOString().slice(0, 10);
  }
  return resultado;
}

export interface OpcoesClienteBcb {
  readonly fetch?: typeof fetch;
  readonly base?: string;
}

export function criarClienteBcb(o: OpcoesClienteBcb = {}): ClienteBcb {
  const buscar = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = o.base ?? URL_SGS;

  async function consultar(codigo: number, de: string, ate: string): Promise<PontoSgs[]> {
    const url = `${base}/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${paraBr(de)}&dataFinal=${paraBr(ate)}`;
    let r: Response;
    try {
      r = await buscar(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      throw new ErroBcb(`sem conexão com o Banco Central ao buscar a série ${codigo}`);
    }
    // O SGS responde 404 quando não há valor no período (ex.: só fim de semana).
    if (r.status === 404) return [];
    if (!r.ok) throw new ErroBcb(`o Banco Central respondeu ${r.status} ao buscar a série ${codigo}`);
    const lido = RespostaSgs.safeParse(await r.json().catch(() => null));
    if (!lido.success) throw new ErroBcb(`o Banco Central mandou a série ${codigo} num formato inesperado`);
    return lido.data.map((p) => ({
      dia: paraIso(p.data),
      valor: p.valor,
      diaFim: p.dataFim ? paraIso(p.dataFim) : null,
    }));
  }

  return {
    async serie(codigo, de, ate) {
      // Série mensal: o mês que a divisa entre duas janelas corta vem nas duas. Fica um
      // ponto por dia, o da consulta mais nova, na ordem em que apareceram.
      const porDia = new Map<string, PontoSgs>();
      for (const [inicio, fim] of janelas(de, ate))
        for (const p of await consultar(codigo, inicio, fim)) porDia.set(p.dia, p);
      return [...porDia.values()];
    },
  };
}
