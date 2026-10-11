import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { dec, type Valor } from "@zentrade/dominio";
import { TABELA_PRECOS, type PrecoModelo } from "./precos.js";

const MILHAO = dec(1_000_000);
const PRECOS: Readonly<Record<string, PrecoModelo>> = TABELA_PRECOS.modelos;

/** Modelo fora da tabela é cobrado pelo preço mais alto: custo subestimado esconde gasto. */
const MAIS_CARO: PrecoModelo = Object.values(PRECOS).reduce((a, b) => (dec(b.saida).gt(a.saida) ? b : a));

const precoDe = (modelo: string | null): PrecoModelo => (modelo ? PRECOS[modelo] : undefined) ?? MAIS_CARO;

interface Fatia {
  readonly modelo: string | null;
  readonly entrada: number;
  readonly saida: number;
  readonly leituraCache: number;
  readonly escrita5m: number;
  readonly escrita1h: number;
}

const custoDaFatia = (f: Fatia): Valor => {
  const p = precoDe(f.modelo);
  return dec(f.entrada)
    .times(p.entrada)
    .plus(dec(f.saida).times(p.saida))
    .plus(dec(f.leituraCache).times(p.leituraCache))
    .plus(dec(f.escrita5m).times(p.escritaCache5m))
    .plus(dec(f.escrita1h).times(p.escritaCache1h))
    .div(MILHAO);
};

/**
 * Quando o servidor detalha `usage.iterations` (o fallback roda outra tentativa dentro
 * da mesma chamada), cada iteração é cobrada pelo modelo que a executou.
 */
function fatias(m: BetaMessage): Fatia[] {
  const u = m.usage;
  if (u.iterations && u.iterations.length > 0) {
    return u.iterations.map((it) => ({
      // A compactação não informa modelo: é cobrada pelo modelo da mensagem.
      modelo: ("model" in it ? it.model : null) ?? m.model,
      entrada: it.input_tokens,
      saida: it.output_tokens,
      leituraCache: it.cache_read_input_tokens,
      escrita5m: it.cache_creation_input_tokens,
      escrita1h: 0,
    }));
  }
  const porTtl = u.cache_creation;
  const escrita1h = porTtl?.ephemeral_1h_input_tokens ?? 0;
  const escrita5m = porTtl ? porTtl.ephemeral_5m_input_tokens : (u.cache_creation_input_tokens ?? 0);
  return [
    {
      modelo: m.model,
      entrada: u.input_tokens,
      saida: u.output_tokens,
      leituraCache: u.cache_read_input_tokens ?? 0,
      escrita5m,
      escrita1h,
    },
  ];
}

/** Custo em US$ de todas as chamadas de uma análise (cada volta do laço de ferramentas). */
export function custoUsd(mensagens: readonly BetaMessage[]): Valor {
  return mensagens.flatMap(fatias).reduce((total, f) => total.plus(custoDaFatia(f)), dec(0));
}
