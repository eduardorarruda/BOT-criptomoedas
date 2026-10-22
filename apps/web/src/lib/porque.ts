import type { Cenario, DecisaoDTO, NomeCenario } from "@zentrade/contratos/esquemas";
import { NOMES_CENARIOS } from "@zentrade/contratos/esquemas";
import { formatarPercentual, formatarPorcento } from "./formatar";

/**
 * Por que a decisão saiu assim, em português, a partir do que o motor já guardou: a
 * proposta do Claude com os três futuros, a avaliação que o CÓDIGO fez deles (valor
 * esperado, chance do favorável, limiar), o veto grave e as barreiras. Nada aqui é
 * recalculado nem inventado: só colocado em palavras.
 */
export type PapelDoFuturo = "decisivo" | "outro";

export interface FuturoExplicado {
  readonly cenario: Cenario;
  readonly papel: PapelDoFuturo;
  /** Por que este futuro decidiu (ou por que não decidiu). */
  readonly texto: string;
}

export interface Veredito {
  /** O que aconteceu com a entrada, numa frase. */
  readonly titulo: string;
  /** O motivo principal. */
  readonly motivo: string;
  readonly tom: "ganho" | "atencao" | "neutro";
}

export interface ExplicacaoDaDecisao {
  readonly veredito: Veredito;
  readonly futuros: readonly FuturoExplicado[];
}

const NOME: Record<NomeCenario, string> = { alta: "alta", lateral: "lateral", baixa: "baixa" };
const pc = (f: number) => formatarPercentual(f, { casas: 0 });
const res = (v: number) => formatarPorcento(v, { casas: 2, sinal: true });

function textoDoDecisivo(c: Cenario, limiar: number | undefined): string {
  const chance = `${pc(c.probabilidade)} de chance`;
  const ganho =
    c.resultadoEstimado >= 0
      ? `ganho estimado de ${res(c.resultadoEstimado)}`
      : `perda estimada de ${res(c.resultadoEstimado)}`;
  if (limiar === undefined) return `É o futuro que a operação precisa: ${chance} e ${ganho}.`;
  return c.probabilidade >= limiar
    ? `É o futuro que a operação precisa: ${chance} (mínimo exigido ${pc(limiar)}) e ${ganho}. Passou do mínimo.`
    : `É o futuro que a operação precisa, mas tem só ${chance}, abaixo do mínimo de ${pc(limiar)}: não sustentou a entrada.`;
}

function textoDoOutro(c: Cenario, decisivo: Cenario): string {
  const chance = `${pc(c.probabilidade)} de chance`;
  const maisProvavel = c.probabilidade > decisivo.probabilidade;
  const comparacao = maisProvavel
    ? `é MAIS provável que o futuro de ${NOME[decisivo.nome]} (${pc(decisivo.probabilidade)})`
    : `é menos provável que o futuro de ${NOME[decisivo.nome]} (${pc(decisivo.probabilidade)})`;
  const efeito =
    c.resultadoEstimado < 0
      ? `levaria a ${res(c.resultadoEstimado)} na operação`
      : c.resultadoEstimado === 0
        ? "empataria"
        : `daria ${res(c.resultadoEstimado)} na operação`;
  return maisProvavel
    ? `Não decidiu a favor: ${chance} — ${comparacao} — e ${efeito}. É o peso contra a entrada.`
    : `Não decidiu: ${chance} — ${comparacao} — e ${efeito}.`;
}

const ordenados = (cenarios: readonly Cenario[]): Cenario[] =>
  [...cenarios].sort((a, b) => NOMES_CENARIOS.indexOf(a.nome) - NOMES_CENARIOS.indexOf(b.nome));

function veredito(d: DecisaoDTO): Veredito {
  const p = d.proposta;
  const a = p?.avaliacao;
  const codigos = d.risco.barreiras.map((b) => b.codigo);
  if (p?.vetoGrave)
    return { titulo: "O Claude vetou", motivo: `Risco grave apontado: ${p.vetoGrave}`, tom: "atencao" };
  if (codigos.includes("agente_aguardar"))
    return {
      titulo: "O Claude propôs aguardar",
      motivo: p?.justificativa ?? "Ele não concordou com o sinal da regra.",
      tom: "atencao",
    };
  if (a?.aplicada && !a.aprovada)
    return { titulo: "A regra dos cenários barrou a entrada", motivo: a.motivo, tom: "atencao" };
  const doRisco = d.risco.barreiras.find((b) => !b.codigo.startsWith("agente_"));
  if (!d.risco.aprovada && doRisco)
    return { titulo: "O risco barrou a entrada", motivo: doRisco.mensagem, tom: "atencao" };
  if (a?.aplicada)
    return {
      titulo: "Os cenários sustentaram a entrada",
      motivo: `Valor esperado ${res(a.valorEsperado)} e ${pc(a.probabilidadeFavoravel)} de chance no futuro favorável (mínimo ${pc(a.limiar)}).`,
      tom: "ganho",
    };
  return {
    titulo: "Os cenários só informam",
    motivo: a?.motivo ?? "A proposta não abre posição, então os cenários não aprovam nem barram.",
    tom: "neutro",
  };
}

/**
 * `null` quando o Claude não analisou (desligado, stop/alvo, barrada antes). Sem os três
 * futuros (proposta antiga), o veredito vem igual e a lista de futuros fica vazia.
 */
export function explicarDecisao(d: DecisaoDTO): ExplicacaoDaDecisao | null {
  if (!d.proposta) return null;
  const cenarios = d.proposta.cenarios;
  if (!cenarios || cenarios.length === 0) return { veredito: veredito(d), futuros: [] };
  const a = d.proposta.avaliacao;
  const lista = ordenados(cenarios);
  const decisivo =
    lista.find((c) => c.nome === a?.favoravel) ??
    lista.reduce((m, c) => (c.probabilidade > m.probabilidade ? c : m));
  return {
    veredito: veredito(d),
    futuros: lista.map((c) =>
      c === decisivo
        ? { cenario: c, papel: "decisivo", texto: textoDoDecisivo(c, a?.limiar) }
        : { cenario: c, papel: "outro", texto: textoDoOutro(c, decisivo) },
    ),
  };
}
