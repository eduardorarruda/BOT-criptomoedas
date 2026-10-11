import { vi } from "vitest";
import type { LeituraInvestimentos } from "../assistente/investimentos/index.js";

/** Leitura dos investimentos de mentira: tudo vazio, a não ser o que o teste trocar. */
export function investimentosFalsos(extra: Partial<LeituraInvestimentos> = {}): LeituraInvestimentos {
  return {
    redesCarteira: vi.fn(async () => []),
    saldosCarteira: vi.fn(async () => []),
    negociacoesCarteira: vi.fn(async () => []),
    sincronizacaoCarteira: vi.fn(async () => null),
    ultimosPrecos: vi.fn(async () => new Map()),
    titulosRendaFixa: vi.fn(async () => []),
    indicador: vi.fn(async () => []),
    imobiliario: vi.fn(async () => []),
    ...extra,
  };
}
