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

export const PROPOSTAS = {
  btcCompra: {
    acao: "comprar",
    confianca: 0.72,
    tamanhoRelativo: 0.8,
    justificativa:
      "O RSI(14) caiu para 28 com o preço ainda acima da SMA(200): é o recuo dentro de tendência de alta que a estratégia procura. Nos 7 casos parecidos do diário, 4 terminaram no alvo e 3 no stop; a média líquida foi positiva depois das taxas. As notícias das últimas 24 h não mudam o cenário. Peço 80% do tamanho porque a volatilidade está acima da média da semana.",
    riscos: [
      "Fluxo em fundos de BTC à vista desacelerou: pode faltar comprador no curto prazo.",
      "Três dos sete casos parecidos bateram no stop.",
    ],
    fontes: [F.diarioExposicao, F.noticiaFundos, F.estrategiaRsi, F.filtros],
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
    confianca: 0.77,
    tamanhoRelativo: 1,
    justificativa:
      "Rompimento com o preço cruzando a SMA(20) e RSI em 58. A rede está estável há 3 dias e o volume confirma o movimento.",
    riscos: ["Rompimentos falham em cerca de um terço dos casos do diário."],
    fontes: [F.noticiaSolana, F.filtros],
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
