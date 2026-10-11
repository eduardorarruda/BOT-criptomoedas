/**
 * Preços da API da Anthropic em US$ por milhão de tokens, conferidos na data abaixo
 * (https://www.anthropic.com/pricing e a documentação de prompt caching). Ao mudar o
 * preço ou o modelo, atualize `conferidaEm` junto.
 *
 * Cache: leitura custa 0,1× a entrada; escrita custa 1,25× (validade de 5 min) ou 2×
 * (validade de 1 h). O agente usa a validade padrão de 5 min.
 */
export interface PrecoModelo {
  readonly entrada: string;
  readonly saida: string;
  readonly leituraCache: string;
  readonly escritaCache5m: string;
  readonly escritaCache1h: string;
}

const OPUS: PrecoModelo = {
  entrada: "5",
  saida: "25",
  leituraCache: "0.5",
  escritaCache5m: "6.25",
  escritaCache1h: "10",
};

export const TABELA_PRECOS = {
  conferidaEm: "2026-10-10",
  modelos: {
    "claude-opus-5": OPUS,
    // Destino do fallback do servidor para recusas da categoria cyber.
    "claude-opus-4-8": OPUS,
  } satisfies Record<string, PrecoModelo>,
} as const;
