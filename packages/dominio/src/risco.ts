import { ehMultiplo, type Valor } from "./dinheiro.js";
import { precoAlvo } from "./estrategia.js";
import { formatarDolar, formatarNumero } from "./formatar.js";
import { barreirasDaConta, type CodigoBarreiraConta, type EstadoConta } from "./risco-conta.js";
import type { FiltrosAtivo, Lado } from "./tipos.js";

/**
 * O motor de risco é a palavra final. Código simples, determinístico, sem IA: a IA
 * propõe, isto aprova ou barra. Se a IA errar ou alucinar, o pior caso é não operar.
 *
 * Vendas que encerram posição passam mesmo com perda do dia estourada ou confiança
 * baixa — sair reduz risco. A pausa, a parada total e a frequência barram entradas e
 * saídas pela regra, nunca a proteção (ver `FinalidadeOrdem` e o ADR 007).
 */
export interface LimitesRisco {
  readonly perdaDiariaMaxima: Valor;
  readonly exposicaoMaxima: Valor;
  readonly ordensPorHoraMax: number;
  readonly pausaAposPerdaMs: number;
  readonly confiancaMinima: number;
}

export interface EstadoRisco {
  readonly pausado: boolean;
  readonly resultadoDoDia: Valor;
  readonly exposicaoAtual: Valor;
  readonly ordensUltimaHora: number;
  readonly ultimaPerdaEm: number | null;
  readonly agora: number;
  /** Limites da conta (todos os robôs da pessoa na rede). Sem isto, só os do robô valem. */
  readonly conta?: EstadoConta;
}

/**
 * Para que serve a ordem: decide quais barreiras valem (ADR 007).
 * - "entrada": a compra. Passa por todas as barreiras.
 * - "saida": venda pela regra de saída — uma decisão nova da estratégia e do agente.
 *   Pausa, parada total e frequência barram.
 * - "protecao": venda que cumpre o combinado na entrada (stop e alvo, os mesmos que
 *   ficam na corretora) e, quando existir o comando, o "zerar posição" pedido pela pessoa. Só a quantidade e os
 *   filtros da corretora barram: sair reduz risco, e posição sem stop é o pior caso.
 */
export type FinalidadeOrdem = "entrada" | "saida" | "protecao";

export interface PropostaOrdem {
  readonly lado: Lado;
  readonly quantidade: Valor;
  readonly precoReferencia: Valor;
  readonly stop?: Valor;
  readonly alvo?: Valor;
  readonly confianca: number;
  /** Sem ela, venda conta como "saida" (o mais restritivo). Compra é sempre "entrada". */
  readonly finalidade?: FinalidadeOrdem;
}

export type CodigoBarreira =
  | "pausado"
  | "frequencia"
  | "perda_diaria"
  | "exposicao"
  | "pausa_apos_perda"
  | "sem_stop"
  | "stop_invalido"
  | "alvo_abaixo_das_taxas"
  | "confianca_baixa"
  | "quantidade_invalida"
  | "quantidade_minima"
  | "quantidade_maxima"
  | "passo_quantidade"
  | "valor_minimo"
  | "poeira"
  | CodigoBarreiraConta;

export interface Barreira {
  readonly codigo: CodigoBarreira;
  readonly mensagem: string;
}

export type ResultadoRisco =
  { readonly aprovada: true } | { readonly aprovada: false; readonly barreiras: readonly Barreira[] };

const minutos = (ms: number): string => `${Math.ceil(ms / 60_000)} min`;

function barreirasDaQuantidade(p: PropostaOrdem, f: FiltrosAtivo): Barreira[] {
  const q = p.quantidade;
  if (q.lte(0))
    return [{ codigo: "quantidade_invalida", mensagem: "A quantidade da ordem precisa ser maior que zero." }];
  const b: Barreira[] = [];
  if (q.lt(f.quantidadeMinima))
    b.push({
      codigo: "quantidade_minima",
      mensagem: `A quantidade ${q.toFixed()} é menor que o mínimo da corretora (${f.quantidadeMinima.toFixed()}).`,
    });
  if (!ehMultiplo(q, f.passoQuantidade))
    b.push({
      codigo: "passo_quantidade",
      mensagem: `A quantidade ${q.toFixed()} não é múltipla do passo da corretora (${f.passoQuantidade.toFixed()}).`,
    });
  if (f.quantidadeMaxima && q.gt(f.quantidadeMaxima))
    b.push({
      codigo: "quantidade_maxima",
      mensagem: `A quantidade ${q.toFixed()} passa do máximo da corretora (${f.quantidadeMaxima.toFixed()}).`,
    });
  const valor = q.times(p.precoReferencia);
  if (valor.lt(f.valorMinimo))
    b.push({
      codigo: "valor_minimo",
      mensagem: `A ordem vale ${formatarDolar(valor)}; a corretora exige pelo menos ${formatarDolar(f.valorMinimo)}.`,
    });
  return b;
}

export const finalidadeDe = (p: Pick<PropostaOrdem, "lado" | "finalidade">): FinalidadeOrdem =>
  p.lado === "COMPRA" ? "entrada" : (p.finalidade ?? "saida");

/**
 * Venda abaixo do mínimo da corretora (quantidade ou valor): é poeira. Não há ordem que
 * a venda; dizer só "abaixo do mínimo" deixaria a pessoa achando que é um erro do robô.
 */
function poeira(p: PropostaOrdem, f: FiltrosAtivo): Barreira | null {
  const q = p.quantidade;
  const valor = q.times(p.precoReferencia);
  if (q.gt(0) && q.gte(f.quantidadeMinima) && valor.gte(f.valorMinimo)) return null;
  return {
    codigo: "poeira",
    mensagem: `A posição a vender (${q.toFixed()}, cerca de ${formatarDolar(valor)}) está abaixo do mínimo da corretora (${f.quantidadeMinima.toFixed()} e ${formatarDolar(f.valorMinimo)}): é poeira e nenhuma ordem consegue vendê-la, nem o stop. Ela fica na carteira; na Binance, "Converter saldos pequenos em BNB" a recolhe.`,
  };
}

function barreirasDaVenda(p: PropostaOrdem, f: FiltrosAtivo): Barreira[] {
  const resto = poeira(p, f);
  return resto ? [resto] : barreirasDaQuantidade(p, f);
}

export const BARREIRA_PAUSADO: Barreira = {
  codigo: "pausado",
  mensagem:
    "O robô está pausado (ou a parada total está ligada): nenhuma entrada nem saída pela regra sai até alguém religar. O stop e o alvo seguem valendo.",
};

/** Pausa (do robô ou parada total) e frequência: valem para entrada e saída pela regra. */
function barreirasDeOperacao(e: EstadoRisco, l: LimitesRisco): Barreira[] {
  const b: Barreira[] = [];
  if (e.pausado) b.push(BARREIRA_PAUSADO);
  if (e.ordensUltimaHora >= l.ordensPorHoraMax)
    b.push({
      codigo: "frequencia",
      mensagem: `Já foram ${e.ordensUltimaHora} ordens na última hora; o limite é ${l.ordensPorHoraMax}.`,
    });
  return b;
}

function barreirasDaCompra(p: PropostaOrdem, e: EstadoRisco, l: LimitesRisco, taxa: number): Barreira[] {
  const b: Barreira[] = [];
  if (e.resultadoDoDia.lte(l.perdaDiariaMaxima.neg()))
    b.push({
      codigo: "perda_diaria",
      mensagem: `A perda do dia (${formatarDolar(e.resultadoDoDia.neg())}) chegou ao limite de ${formatarDolar(l.perdaDiariaMaxima)}. Compras voltam amanhã.`,
    });
  const exposicao = e.exposicaoAtual.plus(p.quantidade.times(p.precoReferencia));
  if (exposicao.gt(l.exposicaoMaxima))
    b.push({
      codigo: "exposicao",
      mensagem: `Com esta compra a exposição iria a ${formatarDolar(exposicao)}; o máximo é ${formatarDolar(l.exposicaoMaxima)}.`,
    });
  if (e.ultimaPerdaEm !== null && e.agora - e.ultimaPerdaEm < l.pausaAposPerdaMs)
    b.push({
      codigo: "pausa_apos_perda",
      mensagem: `Houve uma perda há ${minutos(e.agora - e.ultimaPerdaEm)}; novas compras esperam ${minutos(l.pausaAposPerdaMs)} depois de uma perda.`,
    });
  if (!p.stop)
    b.push({ codigo: "sem_stop", mensagem: "Toda compra precisa de stop: sem ele não existe perda máxima." });
  else if (p.stop.gte(p.precoReferencia))
    b.push({ codigo: "stop_invalido", mensagem: "O stop precisa ficar abaixo do preço de compra." });
  const empate = precoAlvo(p.precoReferencia, 0, taxa);
  if (p.alvo && p.alvo.lt(empate))
    b.push({
      codigo: "alvo_abaixo_das_taxas",
      mensagem: `O alvo ${formatarNumero(p.alvo)} não cobre as taxas: abaixo de ${formatarNumero(empate)} a operação perde dinheiro mesmo dando certo.`,
    });
  if (p.confianca < l.confiancaMinima)
    b.push({
      codigo: "confianca_baixa",
      mensagem: `A confiança da proposta (${formatarNumero(p.confianca)}) está abaixo do mínimo configurado (${formatarNumero(l.confiancaMinima)}).`,
    });
  return b;
}

export function avaliarRisco(
  p: PropostaOrdem,
  e: EstadoRisco,
  l: LimitesRisco,
  f: FiltrosAtivo,
  taxa: number,
): ResultadoRisco {
  const finalidade = finalidadeDe(p);
  const barreiras: Barreira[] = [
    ...(finalidade === "protecao" ? [] : barreirasDeOperacao(e, l)),
    ...(p.lado === "COMPRA"
      ? [...barreirasDaQuantidade(p, f), ...barreirasDaCompra(p, e, l, taxa)]
      : barreirasDaVenda(p, f)),
    ...(p.lado === "COMPRA" && e.conta ? barreirasDaConta(p, e.conta) : []),
  ];
  return barreiras.length === 0 ? { aprovada: true } : { aprovada: false, barreiras };
}
