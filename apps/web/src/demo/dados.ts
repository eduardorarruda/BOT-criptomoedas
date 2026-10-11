import type { EstrategiaDTO, LimitesRiscoDTO, RoboDTO } from "@zentrade/contratos";
import type { Automacao, ContaCorretora, Documento, TokenApi, Usuario } from "../api/esquemas";

/** Dados fixos do modo de demonstração. Tudo é fictício. */
const HORA = 3_600_000;
const DIA = 24 * HORA;

export const USUARIO_DEMO: Usuario = { id: "u-demo", email: "voce@exemplo.com", nome: "Você" };

export const SIMBOLOS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;
export type SimboloDemo = (typeof SIMBOLOS)[number];

export const PRECO_BASE: Record<SimboloDemo, number> = {
  BTCUSDT: 64250,
  ETHUSDT: 2480,
  SOLUSDT: 148.2,
  BNBUSDT: 585,
};

export const VOLATILIDADE: Record<SimboloDemo, number> = {
  BTCUSDT: 0.0016,
  ETHUSDT: 0.002,
  SOLUSDT: 0.003,
  BNBUSDT: 0.0018,
};

export const ESTRATEGIAS: readonly EstrategiaDTO[] = [
  {
    id: "e-rsi",
    nome: "Retorno à média com RSI",
    versao: 3,
    entrada: {
      tipo: "e",
      regras: [
        {
          tipo: "comparar",
          esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
          comparador: "<",
          direita: { tipo: "numero", valor: 30 },
        },
        {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: ">",
          direita: { tipo: "indicador", nome: "sma", periodo: 200 },
        },
      ],
    },
    saida: {
      tipo: "comparar",
      esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
      comparador: ">",
      direita: { tipo: "numero", valor: 65 },
    },
    stop: 0.025,
    alvoLiquido: 0.03,
    taxa: 0.001,
  },
  {
    id: "e-medias",
    nome: "Cruzamento de médias",
    versao: 1,
    entrada: {
      tipo: "e",
      regras: [
        {
          tipo: "comparar",
          esquerda: { tipo: "indicador", nome: "ema", periodo: 9 },
          comparador: "cruzouAcima",
          direita: { tipo: "indicador", nome: "ema", periodo: 21 },
        },
        {
          tipo: "nao",
          regra: {
            tipo: "comparar",
            esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
            comparador: ">",
            direita: { tipo: "numero", valor: 70 },
          },
        },
      ],
    },
    stop: 0.03,
    alvoLiquido: 0.045,
    taxa: 0.001,
  },
  {
    id: "e-rompimento",
    nome: "Rompimento com folga",
    versao: 2,
    entrada: {
      tipo: "ou",
      regras: [
        {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: ">",
          direita: {
            tipo: "multiplicar",
            operando: { tipo: "indicador", nome: "sma", periodo: 50 },
            fator: 1.02,
          },
        },
        {
          tipo: "e",
          regras: [
            {
              tipo: "comparar",
              esquerda: { tipo: "preco" },
              comparador: "cruzouAcima",
              direita: { tipo: "indicador", nome: "sma", periodo: 20 },
            },
            {
              tipo: "comparar",
              esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
              comparador: ">=",
              direita: { tipo: "numero", valor: 55 },
            },
          ],
        },
      ],
    },
    stop: 0.02,
    alvoLiquido: 0.025,
    taxa: 0.001,
  },
];

export const LIMITES_PADRAO: LimitesRiscoDTO = {
  perdaDiariaMaxima: "25",
  exposicaoMaxima: "500",
  riscoPorOperacao: "10",
  ordensPorHoraMax: 4,
  pausaAposPerdaMin: 60,
  confiancaMinima: 0.65,
};

export function robosIniciais(agora: number): RoboDTO[] {
  return [
    {
      id: "r-btc",
      nome: "BTC paciente",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      modo: "sugerir",
      rede: "testnet",
      estrategiaId: "e-rsi",
      estrategiaVersao: 3,
      limites: LIMITES_PADRAO,
      pausado: false,
      criadoEm: agora - 21 * DIA,
    },
    {
      id: "r-eth",
      nome: "ETH nas médias",
      simbolo: "ETHUSDT",
      intervalo: "15m",
      modo: "observar",
      rede: "papel",
      estrategiaId: "e-medias",
      estrategiaVersao: 1,
      limites: { ...LIMITES_PADRAO, exposicaoMaxima: "300", riscoPorOperacao: "6" },
      pausado: false,
      criadoEm: agora - 9 * DIA,
    },
    {
      id: "r-sol",
      nome: "SOL rompimento",
      simbolo: "SOLUSDT",
      intervalo: "4h",
      modo: "auto",
      rede: "testnet",
      estrategiaId: "e-rompimento",
      estrategiaVersao: 2,
      limites: { ...LIMITES_PADRAO, perdaDiariaMaxima: "15", confiancaMinima: 0.7 },
      pausado: false,
      criadoEm: agora - 14 * DIA,
    },
    {
      id: "r-bnb",
      nome: "BNB em teste",
      simbolo: "BNBUSDT",
      intervalo: "1h",
      modo: "observar",
      rede: "papel",
      estrategiaId: "e-medias",
      estrategiaVersao: 1,
      limites: LIMITES_PADRAO,
      pausado: true,
      criadoEm: agora - 3 * DIA,
    },
  ];
}

export function documentosIniciais(agora: number): Documento[] {
  return [
    {
      id: "doc-1",
      fonte: "diario",
      titulo: "Diário: BTC barrado por exposição em 02/10",
      publicadoEm: agora - 8 * DIA,
      trechos: 3,
    },
    {
      id: "doc-2",
      fonte: "noticia",
      titulo: "Fluxo em fundos de BTC à vista desacelera na semana",
      url: "https://exemplo.com/noticia-1",
      publicadoEm: agora - 1 * DIA,
      trechos: 5,
    },
    {
      id: "doc-3",
      fonte: "noticia",
      titulo: "Rede Solana registra lentidão por duas horas",
      url: "https://exemplo.com/noticia-2",
      publicadoEm: agora - 2 * DIA,
      trechos: 4,
    },
    {
      id: "doc-4",
      fonte: "regra_corretora",
      titulo: "Binance: filtros LOT_SIZE e MIN_NOTIONAL por par",
      url: "https://exemplo.com/regras",
      publicadoEm: agora - 30 * DIA,
      trechos: 12,
    },
    {
      id: "doc-5",
      fonte: "estrategia",
      titulo: "Retorno à média com RSI — por que exigir preço acima da SMA(200)",
      publicadoEm: agora - 12 * DIA,
      trechos: 2,
    },
    {
      id: "doc-6",
      fonte: "nota",
      titulo: "Não operar SOL em dia de atualização da rede",
      publicadoEm: agora - 5 * DIA,
      trechos: 1,
    },
    {
      id: "doc-7",
      fonte: "diario",
      titulo: "Diário: alvo atingido em ETH depois de 31 h",
      publicadoEm: agora - 4 * DIA,
      trechos: 2,
    },
    {
      id: "doc-8",
      fonte: "regra_corretora",
      titulo: "Binance: limites de pedidos por minuto da API",
      url: "https://exemplo.com/limites",
      publicadoEm: agora - 45 * DIA,
      trechos: 6,
    },
  ];
}

export function tokensIniciais(agora: number): TokenApi[] {
  return [
    {
      id: "t-cli",
      nome: "Terminal do notebook",
      escopo: "leitura",
      criadoEm: agora - 20 * DIA,
      ultimoUsoEm: agora - 2 * HORA,
    },
    {
      id: "t-mcp",
      nome: "Assistente via MCP",
      escopo: "operar",
      criadoEm: agora - 6 * DIA,
      ultimoUsoEm: null,
    },
  ];
}

export function contasIniciais(agora: number): ContaCorretora[] {
  return [
    { id: "c-1", corretora: "binance", rede: "testnet", apiKeyFinal: "…a1b2", criadaEm: agora - 22 * DIA },
  ];
}

export function automacoesIniciais(agora: number): Automacao[] {
  return [
    {
      id: "n8n-aprovacao",
      nome: "Aprovação pelo Telegram",
      descricao: "Manda cada sugestão para o seu Telegram com botões de aprovar e recusar.",
      ativa: true,
      ultimaExecucaoEm: agora - 40 * 60_000,
      ultimoResultado: "ok",
      falhas24h: 0,
    },
    {
      id: "n8n-noticias",
      nome: "Notícias para o conhecimento",
      descricao: "Lê fontes de notícias a cada hora e guarda no conhecimento do agente.",
      ativa: true,
      ultimaExecucaoEm: agora - 12 * 60_000,
      ultimoResultado: "ok",
      falhas24h: 0,
    },
    {
      id: "n8n-saude",
      nome: "Vigia de saúde",
      descricao: "Confere a cada minuto se o motor está vivo; se parar, pausa os robôs e avisa.",
      ativa: true,
      ultimaExecucaoEm: agora - 50_000,
      ultimoResultado: "ok",
      falhas24h: 0,
    },
    {
      id: "n8n-resumo",
      nome: "Resumo diário por e-mail",
      descricao: "Às 21 h manda o resultado do dia, com taxas e custo de IA.",
      ativa: true,
      ultimaExecucaoEm: agora - 23 * HORA,
      ultimoResultado: "falhou",
      falhas24h: 2,
    },
    {
      id: "n8n-parada",
      nome: "Alerta de parada total",
      descricao: "Avisa no Telegram e por e-mail quando a parada total é ligada.",
      ativa: true,
      ultimaExecucaoEm: null,
      ultimoResultado: "nunca",
      falhas24h: 0,
    },
  ];
}
