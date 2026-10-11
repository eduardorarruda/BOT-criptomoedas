import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { dec, precoAlvo, precoStop } from "@zentrade/dominio";
import type { EventoAnalise } from "../api/esquemas";
import { formatarDinheiro, formatarPreco } from "../lib/formatar";
import { PROPOSTAS } from "./propostas";

/**
 * Roteiro de uma análise do agente no exemplo. Cada etapa é uma ferramenta que o
 * agente consultou; a tela mostra uma a uma, ao vivo, no cartão "pensando".
 */
export interface Etapa {
  readonly ferramenta: string;
  readonly descricao: string;
}

export function etapasPara(robo: RoboDTO, preco: string): Etapa[] {
  const ativo = robo.simbolo.replace("USDT", "");
  return [
    {
      ferramenta: "conferir_regra",
      descricao: `Conferiu a regra de entrada no preço ${formatarPreco(preco)}: o sinal continua valendo.`,
    },
    {
      ferramenta: "buscar_casos_parecidos",
      descricao: "Procurou casos parecidos no diário: 7 encontrados, 4 terminaram no alvo.",
    },
    {
      ferramenta: "ler_noticias",
      descricao: `Leu 12 notícias das últimas 24 h sobre ${ativo}; nenhuma muda o cenário.`,
    },
    {
      ferramenta: "consultar_regras_corretora",
      descricao: "Conferiu os filtros da Binance: lote mínimo e valor mínimo atendidos.",
    },
    {
      ferramenta: "medir_volatilidade",
      descricao: "Mediu a volatilidade de 48 h: acima da média, pediu 80% do tamanho.",
    },
  ];
}

export function eventoEtapa(analiseId: string, robo: RoboDTO, etapa: Etapa, em: number): EventoAnalise {
  return { tipo: "analise", analiseId, roboId: robo.id, concluida: false, etapa: { ...etapa, em } };
}

/** Argumento de exemplo coerente com o ativo do robô. */
function propostaPara(simbolo: string) {
  if (simbolo.startsWith("SOL")) return PROPOSTAS.solCompra;
  if (simbolo.startsWith("ETH") || simbolo.startsWith("BNB")) return PROPOSTAS.ethObservar;
  return PROPOSTAS.btcCompra;
}

/** Estado que a decisão nasce, conforme o modo do robô e o risco. */
export function estadoInicial(robo: RoboDTO, aprovada: boolean): DecisaoDTO["estado"] {
  if (!aprovada) return "barrada";
  if (robo.modo === "observar") return "registrada";
  if (robo.modo === "sugerir") return "aguardando_aprovacao";
  return "executada";
}

export function decisaoDaAnalise(
  id: string,
  robo: RoboDTO,
  preco: string,
  em: number,
  exposicaoAtual: string,
): DecisaoDTO {
  const base = propostaPara(robo.simbolo);
  const entrada = dec(preco);
  const quantidade = dec(robo.limites.riscoPorOperacao).times(8).div(entrada).toDecimalPlaces(5, 1);
  const exposicaoNova = dec(exposicaoAtual).plus(quantidade.times(entrada));
  const passa = exposicaoNova.lte(robo.limites.exposicaoMaxima);
  const barreiras = passa
    ? []
    : [
        {
          codigo: "exposicao",
          mensagem: `A exposição iria a ${formatarDinheiro(exposicaoNova.toFixed(2))}; o limite do robô é ${formatarDinheiro(robo.limites.exposicaoMaxima)}.`,
        },
      ];
  const estado = estadoInicial(robo, passa);
  return {
    id,
    roboId: robo.id,
    em,
    sinal: {
      acao: "COMPRAR",
      explicacao: `sinal de entrada de ${robo.nome} no preço ${formatarPreco(preco)}`,
    },
    proposta: {
      ...base,
      stop: precoStop(entrada, 0.025).toFixed(2),
      alvo: precoAlvo(entrada, 0.03, 0.001).toFixed(2),
    },
    quantidade: quantidade.toFixed(),
    preco,
    risco: { aprovada: passa, barreiras },
    estado,
    ...(estado === "executada" ? { ordemId: `o-${id}` } : {}),
    custoIaUsd: "0.0158",
  };
}
