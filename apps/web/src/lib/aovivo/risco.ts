import type { LimitesRiscoDTO, OrdemDTO } from "@zentrade/contratos/esquemas";
import {
  aplicarExecucao,
  dec,
  inicioDoDiaNoFuso,
  POSICAO_ZERADA,
  type Execucao,
  type Valor,
} from "@zentrade/dominio";
import { fusoDaInstancia } from "../fuso";

/**
 * Os três limites que o motor de risco confere a cada decisão, vistos de fora: perda
 * do dia, exposição e ordens por hora. Contas em Decimal; número só para a largura
 * da barra. O dia é o mesmo do motor: a partir da meia-noite no fuso da instância.
 */
const HORA_MS = 3_600_000;
/** A partir daqui a barra fica em atenção (âmbar); em 100%, no limite (coral). */
export const LIMIAR_ATENCAO = 0.7;

export const inicioDoDia = (agora: number, fuso: string): number => inicioDoDiaNoFuso(agora, fuso);

/** As execuções confirmadas das ordens, na ordem em que aconteceram. */
function execucoesDe(ordens: readonly OrdemDTO[]): Execucao[] {
  return ordens
    .flatMap((o) =>
      o.execucoes.map((x) => ({
        lado: o.lado,
        preco: dec(x.preco),
        quantidade: dec(x.quantidade),
        taxaCotacao: dec(x.taxaCotacao),
        em: x.em,
      })),
    )
    .sort((a, b) => a.em - b.em);
}

/**
 * Resultado realizado (líquido das taxas) das execuções a partir de `desdeMs`, como o
 * motor conta. `null` se as execuções não fecham (ex.: venda maior que a posição numa
 * lista incompleta): melhor não mostrar do que mostrar errado.
 */
export function resultadoDesde(ordens: readonly OrdemDTO[], desdeMs: number): Valor | null {
  let posicao = POSICAO_ZERADA;
  let soma = dec(0);
  try {
    for (const ex of execucoesDe(ordens)) {
      const depois = aplicarExecucao(posicao, ex);
      if (ex.em >= desdeMs) soma = soma.plus(depois.resultadoRealizado.minus(posicao.resultadoRealizado));
      posicao = depois;
    }
  } catch {
    return null;
  }
  return soma;
}

export const ordensDesde = (ordens: readonly OrdemDTO[], desdeMs: number): number =>
  ordens.filter((o) => o.criadaEm >= desdeMs).length;

export type NivelMedidor = "ok" | "atencao" | "limite";

export interface Medidor {
  readonly id: "perda" | "exposicao" | "ordens";
  readonly rotulo: string;
  /** Valor e limite em texto decimal (dinheiro) ou inteiro (ordens); `null` = não dá para saber. */
  readonly valor: string | null;
  readonly limite: string;
  /** 0 a 1 (corta em 1) para a barra. */
  readonly fracao: number;
  readonly nivel: NivelMedidor;
}

function medir(valor: Valor, limite: Valor): Pick<Medidor, "fracao" | "nivel"> {
  if (limite.lte(0)) return { fracao: valor.gt(0) ? 1 : 0, nivel: valor.gt(0) ? "limite" : "ok" };
  const bruta = valor.div(limite);
  const nivel: NivelMedidor = bruta.gte(1) ? "limite" : bruta.gte(LIMIAR_ATENCAO) ? "atencao" : "ok";
  return { fracao: Math.min(1, Math.max(0, bruta.toNumber())), nivel };
}

export interface EntradaMedidores {
  readonly limites: LimitesRiscoDTO;
  readonly ordens: readonly OrdemDTO[];
  /** Quantidade da posição aberta e o preço de agora (texto decimal). */
  readonly quantidade: string;
  readonly preco: string | null;
  readonly agora: number;
  /** Padrão: o fuso da instância (o do motor). */
  readonly fuso?: string;
}

export function medidores(e: EntradaMedidores): Medidor[] {
  const resultado = resultadoDesde(e.ordens, inicioDoDia(e.agora, e.fuso ?? fusoDaInstancia()));
  const perda = resultado?.isNegative() ? resultado.neg() : dec(0);
  const exposicao = e.preco ? dec(e.quantidade).times(e.preco) : dec(0);
  const ordens = ordensDesde(e.ordens, e.agora - HORA_MS);
  return [
    {
      id: "perda",
      rotulo: "Perda do dia",
      valor: resultado ? perda.toFixed(2) : null,
      limite: e.limites.perdaDiariaMaxima,
      ...medir(perda, dec(e.limites.perdaDiariaMaxima)),
    },
    {
      id: "exposicao",
      rotulo: "Exposição",
      valor: exposicao.toFixed(2),
      limite: e.limites.exposicaoMaxima,
      ...medir(exposicao, dec(e.limites.exposicaoMaxima)),
    },
    {
      id: "ordens",
      rotulo: "Ordens na última hora",
      valor: String(ordens),
      limite: String(e.limites.ordensPorHoraMax),
      ...medir(dec(ordens), dec(e.limites.ordensPorHoraMax)),
    },
  ];
}
