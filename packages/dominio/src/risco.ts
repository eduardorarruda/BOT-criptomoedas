import { ehMultiplo, type Valor } from "./dinheiro.js";
import { precoAlvo } from "./estrategia.js";
import { formatarDolar, formatarNumero } from "./formatar.js";
import type { FiltrosAtivo, Lado } from "./tipos.js";

/**
 * O motor de risco é a palavra final. Código simples, determinístico, sem IA: a IA
 * propõe, isto aprova ou barra. Se a IA errar ou alucinar, o pior caso é não operar.
 *
 * Vendas que encerram posição passam mesmo com perda do dia estourada ou confiança
 * baixa — sair reduz risco. Só a parada total e a frequência barram vendas.
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
}

export interface PropostaOrdem {
  readonly lado: Lado;
  readonly quantidade: Valor;
  readonly precoReferencia: Valor;
  readonly stop?: Valor;
  readonly alvo?: Valor;
  readonly confianca: number;
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
  | "valor_minimo";

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
  const barreiras: Barreira[] = [];
  if (e.pausado)
    barreiras.push({
      codigo: "pausado",
      mensagem: "A parada total está ligada: nenhuma ordem sai até alguém religar o robô.",
    });
  if (e.ordensUltimaHora >= l.ordensPorHoraMax)
    barreiras.push({
      codigo: "frequencia",
      mensagem: `Já foram ${e.ordensUltimaHora} ordens na última hora; o limite é ${l.ordensPorHoraMax}.`,
    });
  barreiras.push(...barreirasDaQuantidade(p, f));
  if (p.lado === "COMPRA") barreiras.push(...barreirasDaCompra(p, e, l, taxa));
  return barreiras.length === 0 ? { aprovada: true } : { aprovada: false, barreiras };
}
