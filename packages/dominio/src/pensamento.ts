import { detalharRegra, motivosDeNao, type Condicao } from "./condicoes.js";
import type { ContextoMercado } from "./contexto.js";
import { paraTexto, type Valor } from "./dinheiro.js";
import type { Estrategia, MotivoVenda, Sinal } from "./estrategia.js";
import { lerCenario, type LeituraCenario } from "./regime.js";

/**
 * O que o robô pensa a cada vela fechada, mesmo quando a regra não dá sinal: o cenário
 * de mercado, cada condição da regra com os valores, e a conclusão em português. É
 * montado só com o que o motor já calculou (zero IA, zero consulta externa).
 */
export interface PensamentoRobo {
  /** Fechamento da vela, ms UTC. */
  readonly em: number;
  readonly preco: string;
  readonly sinal: Sinal["acao"];
  readonly motivoSaida?: MotivoVenda;
  readonly posicionado: boolean;
  /** Qual regra está em jogo: a de entrada (sem posição) ou a de saída (com posição). */
  readonly regraAvaliada: "entrada" | "saida" | "nenhuma";
  readonly condicoes: Condicao | null;
  readonly cenario: LeituraCenario;
  /** O Claude neste robô: decide (confere cada entrada) ou desligado. */
  readonly agente: "decide" | "desligado";
  readonly explicacao: string;
  readonly conclusao: string;
}

export interface EntradaPensamento {
  readonly estrategia: Estrategia;
  readonly sinal: Sinal;
  readonly ctx: ContextoMercado;
  readonly preco: Valor;
  readonly em: number;
  readonly intervaloMs: number;
  readonly posicionado: boolean;
  readonly agente: "decide" | "desligado";
}

const MOTIVOS_MOSTRADOS = 3;

const SAIDA_POR: Record<MotivoVenda, string> = {
  stop: "pelo stop",
  alvo: "pelo alvo",
  "regra de saída": "pela regra de saída",
  tempo: "pelo tempo máximo",
};

const fim = (texto: string): string => (/[.!?]$/.test(texto) ? texto : `${texto}.`);

function motivoDeFicarDeFora(condicoes: Condicao | null, explicacao: string): string {
  const motivos = condicoes ? motivosDeNao(condicoes) : [];
  if (motivos.length === 0) return fim(explicacao);
  const frase = (m: string) =>
    m.startsWith("dados insuficientes") ? `faltam dados (${m})` : `não é verdade que ${m}`;
  const mostrados = motivos.slice(0, MOTIVOS_MOSTRADOS).map(frase);
  const resto = motivos.length - mostrados.length;
  return fim(`${mostrados.join("; ")}${resto > 0 ? `; e mais ${resto}` : ""}`);
}

function concluir(e: EntradaPensamento, condicoes: Condicao | null): string {
  const { sinal } = e;
  switch (sinal.acao) {
    case "COMPRAR":
      return `Compro: ${fim(sinal.explicacao)} ${
        e.agente === "desligado"
          ? "Claude desligado: só a regra e o risco decidem."
          : "O Claude confere antes da ordem."
      }`;
    case "VENDER":
      return `Saio ${SAIDA_POR[sinal.motivo]}: ${fim(sinal.explicacao)}`;
    case "AGUARDAR":
      return e.posicionado
        ? `Mantenho a posição: ${fim(sinal.explicacao)}`
        : `Fico de fora: ${motivoDeFicarDeFora(condicoes, sinal.explicacao)}`;
  }
}

export function montarPensamento(e: EntradaPensamento): PensamentoRobo {
  const regra = e.posicionado ? e.estrategia.saida : e.estrategia.entrada;
  const avaliavel =
    regra !== undefined && (e.posicionado || (e.estrategia.direcao ?? "comprado") === "comprado");
  const condicoes = avaliavel ? detalharRegra(regra, e.ctx) : null;
  const regraAvaliada = !avaliavel ? "nenhuma" : e.posicionado ? "saida" : "entrada";
  return {
    em: e.em,
    preco: paraTexto(e.preco),
    sinal: e.sinal.acao,
    ...(e.sinal.acao === "VENDER" ? { motivoSaida: e.sinal.motivo } : {}),
    posicionado: e.posicionado,
    regraAvaliada,
    condicoes,
    cenario: lerCenario(e.ctx, { intervaloMs: e.intervaloMs }),
    agente: e.agente,
    explicacao: e.sinal.explicacao,
    conclusao: concluir(e, condicoes),
  };
}
