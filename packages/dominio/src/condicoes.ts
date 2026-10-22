import type { ContextoMercado } from "./contexto.js";
import { avaliar, type Regra } from "./regras.js";

/**
 * A regra aberta em condições, cada uma com o texto e os valores do momento e se
 * vale. Sai do MESMO avaliador que decide (regras.ts), então nunca diverge da decisão.
 */
export interface Condicao {
  readonly tipo: "condicao" | "e" | "ou" | "nao";
  readonly valor: boolean;
  /** Folha: a comparação com os números ("preço (98) < SMA(200) (100)"). Grupo: o nome do grupo. */
  readonly texto: string;
  readonly filhos?: readonly Condicao[];
}

const SUFIXO = /: (sim|não)$/;

export function detalharRegra(regra: Regra, ctx: ContextoMercado): Condicao {
  switch (regra.tipo) {
    case "comparar":
    case "horario": {
      const r = avaliar(regra, ctx);
      return { tipo: "condicao", valor: r.valor, texto: r.explicacao.replace(SUFIXO, "") };
    }
    case "nao": {
      const filho = detalharRegra(regra.regra, ctx);
      return { tipo: "nao", valor: !filho.valor, texto: "nenhuma destas", filhos: [filho] };
    }
    case "e":
    case "ou": {
      const filhos = regra.regras.map((r) => detalharRegra(r, ctx));
      const valor = regra.tipo === "e" ? filhos.every((f) => f.valor) : filhos.some((f) => f.valor);
      return {
        tipo: regra.tipo,
        valor,
        texto: regra.tipo === "e" ? "todas estas" : "pelo menos uma destas",
        filhos,
      };
    }
  }
}

/** Por que a regra deu "não": as condições que falharam (as folhas que seguraram o resultado). */
export function motivosDeNao(c: Condicao): string[] {
  if (c.valor) return [];
  switch (c.tipo) {
    case "condicao":
      return [c.texto];
    case "e":
    case "ou":
      return (c.filhos ?? []).flatMap(motivosDeNao);
    case "nao":
      return (c.filhos ?? []).map((f) => `${f.texto} (e a regra exige que não)`);
  }
}
