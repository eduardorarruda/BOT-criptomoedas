import type { EscopoSequencia, LimitesContaDTO } from "@zentrade/contratos/esquemas";

/** Os limites como a pessoa digita: texto (vírgula ou ponto), vazio = sem limite. */
export interface FormularioLimites {
  readonly perdaDiariaMaxima: string;
  readonly incluirNaoRealizado: boolean;
  readonly exposicaoMaxima: string;
  readonly posicoesAbertasMax: string;
  readonly quedaMaxima: string;
  readonly quedaJanelaHoras: string;
  readonly sequenciaStopsMax: string;
  readonly sequenciaStopsJanelaHoras: string;
  readonly sequenciaStopsEscopo: EscopoSequencia;
  readonly orcamentoIaMensalUsd: string;
  readonly orcamentoIaDiarioUsd: string;
}

type Erros = Partial<Record<keyof FormularioLimites, string>>;
export type Leitura = { ok: true; limites: LimitesContaDTO } | { ok: false; erros: Erros };

const texto = (v: string | number | null): string => (v === null ? "" : String(v).replace(".", ","));

export function paraFormulario(l: LimitesContaDTO): FormularioLimites {
  return {
    perdaDiariaMaxima: texto(l.perdaDiariaMaxima),
    incluirNaoRealizado: l.incluirNaoRealizado,
    exposicaoMaxima: texto(l.exposicaoMaxima),
    posicoesAbertasMax: texto(l.posicoesAbertasMax),
    quedaMaxima: texto(l.quedaMaxima),
    quedaJanelaHoras: String(l.quedaJanelaHoras),
    sequenciaStopsMax: texto(l.sequenciaStopsMax),
    sequenciaStopsJanelaHoras: String(l.sequenciaStopsJanelaHoras),
    sequenciaStopsEscopo: l.sequenciaStopsEscopo,
    orcamentoIaMensalUsd: texto(l.orcamentoIaMensalUsd),
    orcamentoIaDiarioUsd: texto(l.orcamentoIaDiarioUsd),
  };
}

/** "1.500,50" ou "1500.5" → "1500.50"; vazio → null; inválido → undefined. */
export function lerDinheiro(bruto: string): string | null | undefined {
  const t = bruto.trim().replace(/\s|US\$/g, "");
  if (t === "") return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d+)?$/.test(normal) || Number(normal) <= 0) return undefined;
  return normal;
}

function lerInteiro(bruto: string, min: number, max: number, vazio: boolean): number | null | undefined {
  const t = bruto.trim();
  if (t === "") return vazio ? null : undefined;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= min && n <= max ? n : undefined;
}

const DINHEIRO = [
  "perdaDiariaMaxima",
  "exposicaoMaxima",
  "quedaMaxima",
  "orcamentoIaMensalUsd",
  "orcamentoIaDiarioUsd",
] as const;
const INTEIROS = [
  ["posicoesAbertasMax", 1, 100, true],
  ["quedaJanelaHoras", 1, 720, false],
  ["sequenciaStopsMax", 1, 50, true],
  ["sequenciaStopsJanelaHoras", 1, 168, false],
] as const;

/** Confere o formulário com as mesmas faixas da API e diz, campo a campo, o que corrigir. */
export function lerFormulario(f: FormularioLimites): Leitura {
  const erros: Erros = {};
  const dinheiro: Partial<Record<(typeof DINHEIRO)[number], string | null>> = {};
  for (const k of DINHEIRO) {
    const v = lerDinheiro(f[k]);
    if (v === undefined) erros[k] = "Use um valor maior que zero, como 150 ou 150,50 (vazio = sem limite).";
    else dinheiro[k] = v;
  }
  const inteiros: Partial<Record<(typeof INTEIROS)[number][0], number | null>> = {};
  for (const [k, min, max, vazio] of INTEIROS) {
    const v = lerInteiro(f[k], min, max, vazio);
    if (v === undefined)
      erros[k] = `Use um número inteiro de ${min} a ${max}${vazio ? " (vazio = sem limite)" : ""}.`;
    else inteiros[k] = v;
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    limites: {
      perdaDiariaMaxima: dinheiro.perdaDiariaMaxima ?? null,
      incluirNaoRealizado: f.incluirNaoRealizado,
      exposicaoMaxima: dinheiro.exposicaoMaxima ?? null,
      posicoesAbertasMax: inteiros.posicoesAbertasMax ?? null,
      quedaMaxima: dinheiro.quedaMaxima ?? null,
      quedaJanelaHoras: inteiros.quedaJanelaHoras ?? 72,
      sequenciaStopsMax: inteiros.sequenciaStopsMax ?? null,
      sequenciaStopsJanelaHoras: inteiros.sequenciaStopsJanelaHoras ?? 24,
      sequenciaStopsEscopo: f.sequenciaStopsEscopo,
      orcamentoIaMensalUsd: dinheiro.orcamentoIaMensalUsd ?? null,
      orcamentoIaDiarioUsd: dinheiro.orcamentoIaDiarioUsd ?? null,
    },
  };
}
