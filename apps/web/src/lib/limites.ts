import { ModoDiasDeEventoEsquema, type LimitesRiscoDTO } from "@zentrade/contratos/esquemas";
import { erroInteiro, erroValorPositivo, lerDecimalDigitado, paraCampo } from "./entrada";

/** Campos do formulário de limites de risco (texto como digitado) e sua validação. */
export interface CamposLimitesTexto {
  perdaDiariaMaxima: string;
  exposicaoMaxima: string;
  riscoPorOperacao: string;
  ordensPorHoraMax: string;
  pausaAposPerdaMin: string;
  confiancaMinima: string;
  /** ignorar | bloquear | reduzir (o valor do seletor). */
  diasDeEvento: string;
}

export const deLimites = (l: LimitesRiscoDTO): CamposLimitesTexto => ({
  perdaDiariaMaxima: paraCampo(l.perdaDiariaMaxima),
  exposicaoMaxima: paraCampo(l.exposicaoMaxima),
  riscoPorOperacao: paraCampo(l.riscoPorOperacao),
  ordensPorHoraMax: String(l.ordensPorHoraMax),
  pausaAposPerdaMin: String(l.pausaAposPerdaMin),
  confiancaMinima: String(Math.round(l.confiancaMinima * 100)),
  diasDeEvento: l.diasDeEvento,
});

export function validarLimites(c: CamposLimitesTexto): {
  erros: Partial<Record<keyof CamposLimitesTexto, string>>;
  limites: LimitesRiscoDTO | null;
} {
  const erros: Partial<Record<keyof CamposLimitesTexto, string>> = {};
  const marcar = (k: keyof CamposLimitesTexto, e: string | null): void => {
    if (e) erros[k] = e;
  };
  marcar("perdaDiariaMaxima", erroValorPositivo(c.perdaDiariaMaxima, "a perda diária máxima"));
  marcar("exposicaoMaxima", erroValorPositivo(c.exposicaoMaxima, "a exposição máxima"));
  marcar("riscoPorOperacao", erroValorPositivo(c.riscoPorOperacao, "o risco por operação"));
  marcar("ordensPorHoraMax", erroInteiro(c.ordensPorHoraMax, "Ordens por hora", 1, 120));
  marcar("pausaAposPerdaMin", erroInteiro(c.pausaAposPerdaMin, "A pausa depois de perda", 0, 1440));
  marcar("confiancaMinima", erroInteiro(c.confiancaMinima, "A confiança mínima", 0, 100));
  if (Object.keys(erros).length) return { erros, limites: null };
  return {
    erros,
    limites: {
      perdaDiariaMaxima: lerDecimalDigitado(c.perdaDiariaMaxima) ?? "0",
      exposicaoMaxima: lerDecimalDigitado(c.exposicaoMaxima) ?? "0",
      riscoPorOperacao: lerDecimalDigitado(c.riscoPorOperacao) ?? "0",
      ordensPorHoraMax: Number(c.ordensPorHoraMax),
      pausaAposPerdaMin: Number(c.pausaAposPerdaMin),
      confiancaMinima: Number(c.confiancaMinima) / 100,
      diasDeEvento: ModoDiasDeEventoEsquema.catch("ignorar").parse(c.diasDeEvento),
    },
  };
}
