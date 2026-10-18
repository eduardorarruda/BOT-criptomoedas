import type { Fonte as FonteProposta, PropostaAgente } from "@zentrade/contratos/esquemas";

/** Textos das propostas de exemplo: o tipo de raciocínio que o agente devolve. */
const F = {
  diarioExposicao: {
    tipo: "diario",
    id: "doc-1",
    titulo: "Diário: BTC barrado por exposição em 02/10",
    data: "02/10",
  },
  noticiaFundos: {
    tipo: "noticia",
    id: "doc-2",
    titulo: "Fluxo em fundos de BTC à vista desacelera na semana",
    data: "09/10",
  },
  noticiaSolana: {
    tipo: "noticia",
    id: "doc-3",
    titulo: "Rede Solana registra lentidão por duas horas",
    data: "08/10",
  },
  filtros: {
    tipo: "regra_corretora",
    id: "doc-4",
    titulo: "Binance: filtros LOT_SIZE e MIN_NOTIONAL por par",
  },
  estrategiaRsi: {
    tipo: "estrategia",
    id: "doc-5",
    titulo: "Retorno à média com RSI — por que exigir preço acima da SMA(200)",
  },
  notaSol: { tipo: "nota", id: "doc-6", titulo: "Não operar SOL em dia de atualização da rede" },
  diarioEth: {
    tipo: "diario",
    id: "doc-7",
    titulo: "Diário: alvo atingido em ETH depois de 31 h",
    data: "06/10",
  },
} satisfies Record<string, FonteProposta>;

type Modelo = Omit<PropostaAgente, "stop" | "alvo">;

/**
 * Prévias de futuro de exemplo. O resultado de cada cenário já é líquido das duas
 * taxas (0,1% cada): alvo de 3% líquido, stop de 2,5% (−2,7% com as taxas) e
 * lateral custando só as taxas. O valor esperado é Σ probabilidade × resultado,
 * arredondado em 2 casas, como o código faz.
 */
/** O limiar padrão do agente (AGENTE_CENARIO_LIMIAR). */
const LIMIAR = 0.6;
const ALVO = 3;
const STOP = -2.7;
const TAXAS = -0.2;

/** Os campos de cenário saem da proposta (ex.: a venda reaproveita o texto da compra). */
export function semCenarios(p: Modelo): Modelo {
  const { cenarios: _cenarios, contraArgumento: _contra, avaliacao: _avaliacao, ...resto } = p;
  return resto;
}

export const PROPOSTAS = {
  btcCompra: {
    acao: "comprar",
    // Não passa da probabilidade do cenário favorável (o agente limita assim).
    confianca: 0.64,
    tamanhoRelativo: 0.8,
    justificativa:
      "O RSI(14) caiu para 28 com o preço ainda acima da SMA(200): é o recuo dentro de tendência de alta que a estratégia procura. Nos 7 casos parecidos do diário, 4 terminaram no alvo e 3 no stop; a média líquida foi positiva depois das taxas. As notícias das últimas 24 h não mudam o cenário. Peço 80% do tamanho porque a volatilidade está acima da média da semana.",
    riscos: [
      "Fluxo em fundos de BTC à vista desacelerou: pode faltar comprador no curto prazo.",
      "Três dos sete casos parecidos bateram no stop.",
    ],
    fontes: [F.diarioExposicao, F.noticiaFundos, F.estrategiaRsi, F.filtros],
    // 0,65 × 3 + 0,25 × (−0,2) + 0,1 × (−2,7) = +1,63
    cenarios: [
      {
        nome: "alta",
        probabilidade: 0.65,
        horizonte: 24,
        gatilho: "Fechamento de 1 h acima da máxima do recuo, com volume acima da média.",
        invalidacao: "Fechamento abaixo da SMA(200): a tendência de alta deixa de valer.",
        resultadoEstimado: ALVO,
      },
      {
        nome: "lateral",
        probabilidade: 0.25,
        horizonte: 24,
        gatilho: "O preço fica entre o stop e o alvo e o RSI volta para perto de 50.",
        invalidacao: "Rompimento claro do alvo ou do stop.",
        resultadoEstimado: TAXAS,
      },
      {
        nome: "baixa",
        probabilidade: 0.1,
        horizonte: 12,
        gatilho: "Novo fundo abaixo do recuo com o fluxo dos fundos ainda caindo.",
        invalidacao: "Recuperação acima da máxima do recuo.",
        resultadoEstimado: STOP,
      },
    ],
    contraArgumento:
      "O fluxo para os fundos de BTC à vista está desacelerando: sem comprador novo, o recuo pode virar uma perna de baixa — e três dos sete casos parecidos terminaram no stop.",
    avaliacao: {
      valorEsperado: 1.63,
      favoravel: "alta",
      probabilidadeFavoravel: 0.65,
      limiar: LIMIAR,
      aplicada: true,
      aprovada: true,
      motivo: "valor esperado líquido +1,63% e cenário de alta com 65% (limiar 60%)",
    },
  },
  solCompraFraca: {
    acao: "comprar",
    confianca: 0.58,
    tamanhoRelativo: 0.5,
    justificativa:
      "O preço passou 2% acima da SMA(50), mas a rede Solana teve lentidão ontem e sua nota pede para evitar dias de instabilidade. Casos parecidos são poucos (3) para dar confiança.",
    riscos: ["Instabilidade recente da rede.", "Amostra pequena de casos parecidos."],
    fontes: [F.noticiaSolana, F.notaSol],
  },
  ethObservar: {
    acao: "comprar",
    confianca: 0.66,
    tamanhoRelativo: 1,
    justificativa:
      "A EMA(9) cruzou acima da EMA(21) com RSI em 54, longe de sobrecompra. O último cruzamento parecido levou 31 h até o alvo.",
    riscos: ["Cruzamentos em 15 min dão muitos sinais falsos em mercado lateral."],
    fontes: [F.diarioEth],
  },
  solCompra: {
    acao: "comprar",
    confianca: 0.6,
    tamanhoRelativo: 1,
    justificativa:
      "Rompimento com o preço cruzando a SMA(20) e RSI em 58. A rede está estável há 3 dias e o volume confirma o movimento.",
    riscos: ["Rompimentos falham em cerca de um terço dos casos do diário."],
    fontes: [F.noticiaSolana, F.filtros],
    // 0,6 × 3 + 0,3 × (−0,2) + 0,1 × (−2,7) = +1,47
    cenarios: [
      {
        nome: "alta",
        probabilidade: 0.6,
        horizonte: 12,
        gatilho: "Duas velas de 4 h fechando acima da SMA(20) com volume crescente.",
        invalidacao: "Volta para baixo da SMA(20) no fechamento.",
        resultadoEstimado: ALVO,
      },
      {
        nome: "lateral",
        probabilidade: 0.3,
        horizonte: 12,
        gatilho: "O volume some e o preço anda de lado perto da SMA(20).",
        invalidacao: "Um novo pico de volume para qualquer lado.",
        resultadoEstimado: TAXAS,
      },
      {
        nome: "baixa",
        probabilidade: 0.1,
        horizonte: 6,
        gatilho: "Rompimento falso: fechamento de volta abaixo da SMA(20) com volume.",
        invalidacao: "Nova máxima acima do rompimento.",
        resultadoEstimado: STOP,
      },
    ],
    contraArgumento:
      "Um terço dos rompimentos do diário falhou, e a rede teve lentidão há poucos dias: um novo incidente derruba o preço antes de o alvo chegar.",
    avaliacao: {
      valorEsperado: 1.47,
      favoravel: "alta",
      probabilidadeFavoravel: 0.6,
      limiar: LIMIAR,
      aplicada: true,
      aprovada: true,
      motivo: "valor esperado líquido +1,47% e cenário de alta com 60% (limiar 60%)",
    },
  },
  ethAguardar: {
    acao: "aguardar",
    confianca: 0.52,
    tamanhoRelativo: 0.5,
    justificativa:
      "A EMA(9) cruzou acima da EMA(21), mas o RSI está em 49 e o preço anda de lado há dois dias. Em 15 min, cruzamentos assim no meio de um lateral costumam devolver o movimento.",
    riscos: ["Mercado lateral: cruzamentos de médias curtas dão muitos sinais falsos."],
    fontes: [F.diarioEth],
    // 0,25 × 3 + 0,45 × (−0,2) + 0,3 × (−2,7) = −0,15
    cenarios: [
      {
        nome: "alta",
        probabilidade: 0.25,
        horizonte: 64,
        gatilho: "Rompimento da máxima dos últimos dois dias com volume.",
        invalidacao: "A EMA(9) volta para baixo da EMA(21).",
        resultadoEstimado: ALVO,
      },
      {
        nome: "lateral",
        probabilidade: 0.45,
        horizonte: 48,
        gatilho: "O preço continua preso na faixa dos últimos dois dias.",
        invalidacao: "Fechamento fora da faixa.",
        resultadoEstimado: TAXAS,
      },
      {
        nome: "baixa",
        probabilidade: 0.3,
        horizonte: 32,
        gatilho: "Perda da mínima da faixa com o RSI abaixo de 45.",
        invalidacao: "Retomada da EMA(21).",
        resultadoEstimado: STOP,
      },
    ],
    contraArgumento:
      "Esperar pode deixar passar o começo do movimento: o último cruzamento parecido chegou ao alvo, mesmo levando 31 h.",
    avaliacao: {
      valorEsperado: -0.15,
      favoravel: "alta",
      probabilidadeFavoravel: 0.25,
      limiar: LIMIAR,
      aplicada: true,
      aprovada: false,
      motivo: "valor esperado líquido −0,15% não é positivo",
    },
  },
  btcVendaAlvo: {
    acao: "vender",
    confianca: 0.9,
    tamanhoRelativo: 1,
    justificativa:
      "O preço chegou ao alvo líquido de 3% depois das duas taxas. Encerrar a posição como planejado.",
    riscos: [],
    fontes: [F.estrategiaRsi],
  },
  solVendaStop: {
    acao: "vender",
    confianca: 0.95,
    tamanhoRelativo: 1,
    justificativa: "O preço tocou o stop de 2%. Sair limita a perda ao que foi planejado na entrada.",
    riscos: [],
    fontes: [],
  },
} satisfies Record<string, Modelo>;
