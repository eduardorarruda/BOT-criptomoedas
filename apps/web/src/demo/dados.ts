import type { CoberturaWin, EstrategiaDTO, LimitesRiscoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { MODELOS_WIN } from "@zentrade/dominio";
import type { Automacao, ContaCorretora, Documento, TokenApi, Usuario } from "../api/esquemas";

/** Dados fixos do modo de demonstração. Tudo é fictício. */
const HORA = 3_600_000;
const DIA = 24 * HORA;

export const USUARIO_DEMO: Usuario = {
  id: "u-demo",
  email: "voce@exemplo.com",
  nome: "Você",
  doisFatores: false,
};

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

const ESTRATEGIAS_CRIPTO: readonly EstrategiaDTO[] = [
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
    tempoMaximo: 24,
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
          tipo: "comparar",
          esquerda: { tipo: "indicador", nome: "adx", periodo: 14, saida: "adx" },
          comparador: ">",
          direita: { tipo: "numero", valor: 20 },
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
    stopMovel: { tipo: "percentual", distancia: 0.025 },
  },
  {
    id: "e-rompimento",
    nome: "Rompimento de Donchian",
    versao: 2,
    entrada: {
      tipo: "e",
      regras: [
        {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: ">",
          direita: { tipo: "indicador", nome: "donchian", periodo: 20, saida: "superior" },
        },
        {
          tipo: "comparar",
          esquerda: { tipo: "indicador", nome: "volumeRelativo", periodo: 20 },
          comparador: ">",
          direita: { tipo: "numero", valor: 1.3 },
        },
      ],
    },
    saida: {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: "<",
      direita: { tipo: "indicador", nome: "donchian", periodo: 10, saida: "inferior" },
    },
    stop: 0.06,
    alvoLiquido: 0.2,
    taxa: 0.001,
    stopAtr: { periodo: 14, multiplo: 2 },
    stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 },
    tamanhoPorVolatilidade: { periodo: 14, multiplo: 2 },
  },
];

function modeloWin(id: string) {
  const modelo = MODELOS_WIN.find((m) => m.id === id);
  if (!modelo) throw new Error(`modelo do mini índice ${id} não existe`);
  return modelo.estrategia;
}

/** A estratégia do mini índice do exemplo: o modelo da faixa de abertura, nos dois sentidos. */
export const ESTRATEGIA_WIN: EstrategiaDTO = {
  id: "e-win-faixa",
  nome: "Faixa de abertura no mini índice",
  versao: 1,
  ...modeloWin("win-faixa-abertura-30"),
};

export const ESTRATEGIAS: readonly EstrategiaDTO[] = [...ESTRATEGIAS_CRIPTO, ESTRATEGIA_WIN];

/**
 * Candles do mini índice "gravados" no exemplo: 2 anos de WIN importado de um CSV do
 * MetaTrader 5 (até 3 dias atrás) e 60 dias corridos do Ibovespa (WIN-IBOV), como a
 * brapi entrega.
 */
export function coberturaWinDemo(agora: number): CoberturaWin[] {
  const ate = Math.floor(agora / DIA) * DIA;
  const faixa = (simbolo: CoberturaWin["simbolo"], dias: number, atras: number, porDia: number) =>
    (
      [
        ["5m", 1],
        ["15m", 3],
        ["1h", 12],
      ] as const
    ).map(([intervalo, cincos]) => ({
      simbolo,
      intervalo,
      primeiro: ate - (dias + atras) * DIA + 12 * HORA,
      ultimo: ate - atras * DIA + 21 * HORA,
      candles: Math.round((dias * 5 * porDia) / 7 / cincos),
    }));
  return [...faixa("WIN", 730, 3, 113), ...faixa("WIN-IBOV", 60, 1, 84)];
}

export const LIMITES_PADRAO: LimitesRiscoDTO = {
  perdaDiariaMaxima: "25",
  exposicaoMaxima: "500",
  riscoPorOperacao: "10",
  ordensPorHoraMax: 4,
  pausaAposPerdaMin: 60,
  confiancaMinima: 0.65,
  diasDeEvento: "ignorar",
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
      url: null,
      publicadoEm: agora - 8 * DIA,
      criadoEm: agora - 8 * DIA,
    },
    {
      id: "doc-2",
      fonte: "noticia",
      titulo: "Fluxo em fundos de BTC à vista desacelera na semana",
      url: "https://exemplo.com/noticia-1",
      publicadoEm: agora - 1 * DIA,
      criadoEm: agora - 1 * DIA,
    },
    {
      id: "doc-3",
      fonte: "noticia",
      titulo: "Rede Solana registra lentidão por duas horas",
      url: "https://exemplo.com/noticia-2",
      publicadoEm: agora - 2 * DIA,
      criadoEm: agora - 2 * DIA,
    },
    {
      id: "doc-4",
      fonte: "regra_corretora",
      titulo: "Binance: filtros LOT_SIZE e MIN_NOTIONAL por par",
      url: "https://exemplo.com/regras",
      publicadoEm: agora - 30 * DIA,
      criadoEm: agora - 30 * DIA,
    },
    {
      id: "doc-5",
      fonte: "estrategia",
      titulo: "Retorno à média com RSI — por que exigir preço acima da SMA(200)",
      url: null,
      publicadoEm: agora - 12 * DIA,
      criadoEm: agora - 12 * DIA,
    },
    {
      id: "doc-6",
      fonte: "nota",
      titulo: "Não operar SOL em dia de atualização da rede",
      url: null,
      publicadoEm: agora - 5 * DIA,
      criadoEm: agora - 5 * DIA,
    },
    {
      id: "doc-7",
      fonte: "diario",
      titulo: "Diário: alvo atingido em ETH depois de 31 h",
      url: null,
      publicadoEm: agora - 4 * DIA,
      criadoEm: agora - 4 * DIA,
    },
    {
      id: "doc-8",
      fonte: "regra_corretora",
      titulo: "Binance: limites de pedidos por minuto da API",
      url: "https://exemplo.com/limites",
      publicadoEm: agora - 45 * DIA,
      criadoEm: agora - 45 * DIA,
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
