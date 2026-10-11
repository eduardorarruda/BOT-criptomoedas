import type { ModeloSugerido } from "@zentrade/contratos";

/**
 * Atalhos para o seletor da tela. A pessoa pode digitar outro nome: estes são só os
 * mais comuns. Na API, ids completos (todos com pensamento adaptativo); no Claude Code,
 * também os apelidos que o próprio CLI entende (`--model opus`).
 */
export const MODELOS_SUGERIDOS: { readonly api: ModeloSugerido[]; readonly cli: ModeloSugerido[] } = {
  api: [
    { id: "claude-opus-5", nome: "Opus 5", descricao: "O padrão do analista: forte e equilibrado" },
    { id: "claude-opus-5-5", nome: "Opus 5.5", descricao: "O Opus mais novo, um pouco mais barato" },
    { id: "claude-sonnet-5", nome: "Sonnet 5", descricao: "Mais rápido e mais barato, bom para o dia a dia" },
    { id: "claude-fable-5-1", nome: "Fable 5.1", descricao: "O mais capaz, e o mais caro" },
  ],
  cli: [
    { id: "opus", nome: "Opus (apelido)", descricao: "O Opus mais recente do seu plano" },
    { id: "sonnet", nome: "Sonnet (apelido)", descricao: "Mais rápido; gasta menos do limite do plano" },
    { id: "fable", nome: "Fable (apelido)", descricao: "O mais capaz; pode usar créditos extras do plano" },
    { id: "claude-opus-5", nome: "Opus 5", descricao: "Versão fixa do Opus 5" },
  ],
};
