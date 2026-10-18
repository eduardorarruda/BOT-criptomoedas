import {
  placarParaDTO,
  type AvaliacaoDecisao,
  type DecisaoDTO,
  type EstrategiaDTO,
  type PlacarDTO,
  type PropostaAgente,
  type RoboDTO,
} from "@zentrade/contratos/esquemas";
import { calcularPlacar, dec, mercadoDoSimbolo, type DecisaoPlacar } from "@zentrade/dominio";
import { criarAleatorio, escolher, type Aleatorio } from "./aleatorio";

/**
 * O placar do Claude no exemplo. As entradas do diário de exemplo ganham a avaliação
 * que o avaliador do motor gravaria (real nas executadas que fecharam; contrafactual
 * nas outras) e entram vetos de exemplo (o Claude propôs aguardar). Os números são
 * fictícios, mas a conta do placar é a de verdade (`calcularPlacar` do domínio).
 */
const HORA = 3_600_000;
const DIA = 24 * HORA;
/** Entradas mais novas que isto ainda não têm candles bastantes: ficam pendentes. */
const RECENTE_MS = 6 * HORA;

interface PerfilVeto {
  readonly roboId: string;
  readonly simbolo: string;
  readonly base: number;
  readonly oscila: number;
  readonly quantidade: string;
  readonly explicacao: string;
}

const PERFIS: readonly PerfilVeto[] = [
  {
    roboId: "r-btc",
    simbolo: "BTCUSDT",
    base: 61_500,
    oscila: 2_800,
    quantidade: "0.00250",
    explicacao: "(RSI(14) < 30: sim) e (preço > SMA(200): sim)",
  },
  {
    roboId: "r-sol",
    simbolo: "SOLUSDT",
    base: 146,
    oscila: 10,
    quantidade: "1.00",
    explicacao: "(preço cruzou acima de SMA(20): sim) e (RSI(14) ≥ 55: sim)",
  },
  {
    roboId: "r-eth",
    simbolo: "ETHUSDT",
    base: 2_460,
    oscila: 120,
    quantidade: "0.080",
    explicacao: "(EMA(9) cruzou acima de EMA(21): sim) e não (RSI(14) > 70: não)",
  },
];

const MOTIVOS_VETO = [
  "O volume do rompimento está abaixo da média de 20 candles e os três últimos casos parecidos do diário bateram no stop.",
  "O sinal veio logo antes de dados de inflação dos EUA: a volatilidade costuma dobrar e o stop de 2,5% fica curto.",
  "A distância até a resistência da semana é menor que o alvo: o ganho esperado não paga o risco depois das taxas.",
  "O RSI está baixo, mas o preço perdeu a SMA(200) há dois dias: não é recuo dentro de alta.",
] as const;

const vetoProposta = (a: Aleatorio, confianca: number): PropostaAgente => ({
  acao: "aguardar",
  confianca,
  tamanhoRelativo: 1,
  justificativa: escolher(a, MOTIVOS_VETO),
  riscos: ["Posso estar perdendo uma entrada boa se o volume voltar."],
  fontes: [],
});

/** Retorno líquido de uma entrada: alvo de +2% a +3,5%, ou stop de −2,3% a −2,8% (com as taxas). */
const retornoDe = (a: Aleatorio, ganhou: boolean): number =>
  ganhou ? 0.02 + a() * 0.015 : -(0.023 + a() * 0.005);

const arredondar = (n: number, casas = 4): number => Math.round(n * 10 ** casas) / 10 ** casas;

function concluida(
  claude: AvaliacaoDecisao["claude"],
  confianca: number,
  nocional: number,
  retorno: number,
  em: number,
  fonte: AvaliacaoDecisao["fonte"] = "contrafactual",
): AvaliacaoDecisao {
  const resultado = dec(nocional).times(retorno).toDecimalPlaces(2);
  return {
    claude,
    confianca,
    fonte,
    situacao: "concluida",
    ...(fonte === "contrafactual" ? { motivo: retorno > 0 ? "alvo" : ("stop" as const) } : {}),
    resultado: resultado.toFixed(),
    retorno: arredondar(retorno, 6),
    barras: 6 + Math.round(Math.abs(retorno) * 900),
    acertou: claude === "aprovou" ? resultado.gt(0) : resultado.lte(0),
    moeda: "USDT",
    avaliadaEm: em,
  };
}

const pendente = (
  claude: AvaliacaoDecisao["claude"],
  confianca: number,
  em: number,
  fonte: AvaliacaoDecisao["fonte"] = "contrafactual",
): AvaliacaoDecisao => ({
  claude,
  confianca,
  fonte,
  situacao: "pendente",
  barras: 2,
  moeda: "USDT",
  avaliadaEm: em,
});

/** Vetos de exemplo: a confiança acompanha (com ruído) se o veto estava certo. */
function vetosDeExemplo(agora: number): DecisaoDTO[] {
  const a = criarAleatorio(7_310);
  return Array.from({ length: 24 }, (_, i) => {
    const perfil = escolher(a, PERFIS);
    const em = agora - (i === 0 ? 2 * HORA : Math.round((8 + i * 3.1 + a() * 2) * DIA));
    const confianca = arredondar(0.55 + a() * 0.38, 2);
    const certo = a() < confianca - 0.04;
    const preco = (perfil.base + (a() - 0.5) * 2 * perfil.oscila).toFixed(2);
    const nocional = Number(preco) * Number(perfil.quantidade);
    const avaliacao =
      agora - em < RECENTE_MS
        ? pendente("vetou", confianca, agora)
        : concluida("vetou", confianca, nocional, retornoDe(a, !certo), em + 20 * HORA);
    const proposta = vetoProposta(a, confianca);
    return {
      id: `d-v${String(i + 1).padStart(2, "0")}`,
      roboId: perfil.roboId,
      em,
      sinal: { acao: "COMPRAR", explicacao: perfil.explicacao },
      proposta,
      preco,
      risco: {
        aprovada: false,
        barreiras: [
          { codigo: "agente_aguardar", mensagem: `O agente propôs "aguardar": ${proposta.justificativa}` },
        ],
      },
      estado: "registrada",
      custoIaUsd: (0.011 + a() * 0.005).toFixed(4),
      avaliacao,
    } satisfies DecisaoDTO;
  });
}

/** A avaliação de uma entrada aprovada do diário de exemplo (e a confiança dela, no histórico). */
function avaliarAprovada(d: DecisaoDTO, a: Aleatorio, agora: number): DecisaoDTO {
  const proposta = d.proposta as PropostaAgente;
  const nocional = Number(d.preco) * Number(d.quantidade ?? "0");
  if (d.estado === "executada") {
    if (!d.desfecho) return { ...d, avaliacao: pendente("aprovou", proposta.confianca, agora, "real") };
    const ganhou = dec(d.desfecho.resultado).gt(0);
    // No histórico, a confiança acompanha o desfecho com ruído: o placar tem o que calibrar.
    const confianca = d.id.startsWith("d-h")
      ? arredondar(ganhou ? 0.7 + a() * 0.22 : 0.56 + a() * 0.22, 2)
      : proposta.confianca;
    const retorno = nocional > 0 ? Number(d.desfecho.resultado) / nocional : 0;
    return {
      ...d,
      proposta: { ...proposta, confianca },
      avaliacao: {
        ...concluida("aprovou", confianca, nocional, retorno, d.desfecho.avaliadoEm, "real"),
        resultado: d.desfecho.resultado,
      },
    };
  }
  if (agora - d.em < RECENTE_MS) return { ...d, avaliacao: pendente("aprovou", proposta.confianca, agora) };
  const ganhou = a() < proposta.confianca - 0.08;
  return {
    ...d,
    avaliacao: concluida("aprovou", proposta.confianca, nocional, retornoDe(a, ganhou), d.em + 20 * HORA),
  };
}

const ehEntradaDoClaude = (d: DecisaoDTO): boolean => d.sinal.acao === "COMPRAR" && d.proposta !== undefined;

/** O diário de exemplo com a avaliação do placar em cada entrada e os vetos de exemplo, do mais novo ao mais velho. */
export function comPlacarDemo(decisoes: readonly DecisaoDTO[], agora: number): DecisaoDTO[] {
  const a = criarAleatorio(4_242);
  const avaliadas = decisoes.map((d) =>
    ehEntradaDoClaude(d) && d.proposta?.acao === "comprar" ? avaliarAprovada(d, a, agora) : d,
  );
  return [...avaliadas, ...vetosDeExemplo(agora)].sort((x, y) => y.em - x.em);
}

export interface FiltroPlacarDemo {
  readonly roboId?: string;
  readonly desde?: number;
}

function paraPlacar(
  d: DecisaoDTO,
  robos: readonly RoboDTO[],
  estrategias: readonly EstrategiaDTO[],
): DecisaoPlacar {
  const robo = robos.find((r) => r.id === d.roboId);
  const estrategia = estrategias.find((e) => e.id === robo?.estrategiaId);
  const proposta = d.proposta as PropostaAgente;
  const a = d.avaliacao;
  const concluida = a?.situacao === "concluida" && a.resultado !== undefined && a.retorno !== undefined;
  return {
    id: d.id,
    em: d.em,
    claude: a?.claude ?? (proposta.acao === "comprar" ? "aprovou" : "vetou"),
    confianca: a?.confianca ?? proposta.confianca,
    fonte: a?.fonte ?? "contrafactual",
    resultado: concluida ? dec(a.resultado as string) : null,
    retorno: concluida ? (a.retorno as number) : null,
    moeda: a?.moeda ?? "USDT",
    roboId: d.roboId,
    roboNome: robo?.nome ?? d.roboId,
    estrategiaId: estrategia?.id ?? "sem-estrategia",
    estrategiaNome: estrategia?.nome ?? "Estratégia removida",
    mercado: mercadoDoSimbolo(robo?.simbolo ?? ""),
  };
}

/** O que GET /decisoes/placar devolveria para o estado do exemplo. */
export function placarDemo(
  e: {
    readonly decisoes: readonly DecisaoDTO[];
    readonly robos: readonly RoboDTO[];
    readonly estrategias: readonly EstrategiaDTO[];
  },
  f: FiltroPlacarDemo,
  agora: number,
): PlacarDTO {
  const lista = e.decisoes
    .filter(ehEntradaDoClaude)
    .filter((d) => (!f.roboId || d.roboId === f.roboId) && (f.desde === undefined || d.em >= f.desde))
    .map((d) => paraPlacar(d, e.robos, e.estrategias));
  return placarParaDTO(calcularPlacar(lista), agora);
}
