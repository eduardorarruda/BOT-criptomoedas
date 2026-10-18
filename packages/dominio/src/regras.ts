import { problemasIndicador, rotuloIndicador, valorIndicador, type OperandoIndicador } from "./catalogo.js";
import { serieDe, type ContextoMercado, type SerieCandle } from "./contexto.js";
import { formatarNumero } from "./formatar.js";

/**
 * A estratégia é uma árvore: grupos E / OU / NÃO com comparações nas folhas. O
 * construtor visual da tela monta essa árvore; aqui ela é avaliada — e explicada —
 * recursivamente, porque a estrutura é recursiva. A explicação sai do mesmo
 * percurso que a decisão, então nunca diverge dela.
 */

/** Campos do último candle fechado, além do fechamento (que é o `preco`). */
export type CampoCandle = "abertura" | "maxima" | "minima" | "volume";

export type Operando =
  | { readonly tipo: "preco" }
  | { readonly tipo: CampoCandle }
  | { readonly tipo: "numero"; readonly valor: number }
  | OperandoIndicador
  | { readonly tipo: "multiplicar"; readonly operando: Operando; readonly fator: number };

export type Comparador = "<" | "<=" | ">" | ">=" | "cruzouAcima" | "cruzouAbaixo";

export type Regra =
  | { readonly tipo: "e"; readonly regras: readonly Regra[] }
  | { readonly tipo: "ou"; readonly regras: readonly Regra[] }
  | { readonly tipo: "nao"; readonly regra: Regra }
  | {
      readonly tipo: "comparar";
      readonly esquerda: Operando;
      readonly comparador: Comparador;
      readonly direita: Operando;
    };

export interface Resultado {
  readonly valor: boolean;
  readonly explicacao: string;
}

const SIMBOLO: Record<Comparador, string> = {
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  cruzouAcima: "cruzou acima de",
  cruzouAbaixo: "cruzou abaixo de",
};

const CAMPO: Readonly<Record<CampoCandle, { rotulo: string; serie: SerieCandle }>> = {
  abertura: { rotulo: "abertura", serie: "aberturas" },
  maxima: { rotulo: "máxima", serie: "maximas" },
  minima: { rotulo: "mínima", serie: "minimas" },
  volume: { rotulo: "volume", serie: "volumes" },
};

export function rotulo(op: Operando): string {
  switch (op.tipo) {
    case "preco":
      return "preço";
    case "abertura":
    case "maxima":
    case "minima":
    case "volume":
      return CAMPO[op.tipo].rotulo;
    case "numero":
      return formatarNumero(op.valor);
    case "indicador":
      return rotuloIndicador(op);
    case "multiplicar":
      return `${formatarNumero(op.fator)} × ${rotulo(op.operando)}`;
  }
}

const ponto = (serie: readonly number[] | null, deslocamento: number): number | null =>
  serie?.[serie.length - 1 - deslocamento] ?? null;

function valorDe(op: Operando, ctx: ContextoMercado, deslocamento: number): number | null {
  switch (op.tipo) {
    case "preco":
      return ponto(ctx.fechamentos, deslocamento);
    case "abertura":
    case "maxima":
    case "minima":
    case "volume":
      return ponto(serieDe(ctx, CAMPO[op.tipo].serie), deslocamento);
    case "numero":
      return op.valor;
    case "indicador":
      return valorIndicador(op, ctx, deslocamento);
    case "multiplicar": {
      const v = valorDe(op.operando, ctx, deslocamento);
      return v === null ? null : v * op.fator;
    }
  }
}

const comValor = (op: Operando, v: number): string =>
  op.tipo === "numero" ? rotulo(op) : `${rotulo(op)} (${formatarNumero(v)})`;

function comparar(regra: Extract<Regra, { tipo: "comparar" }>, ctx: ContextoMercado): Resultado {
  const { esquerda, direita, comparador } = regra;
  const cruzamento = comparador === "cruzouAcima" || comparador === "cruzouAbaixo";
  const a = valorDe(esquerda, ctx, 0);
  const b = valorDe(direita, ctx, 0);
  const a1 = cruzamento ? valorDe(esquerda, ctx, 1) : 0;
  const b1 = cruzamento ? valorDe(direita, ctx, 1) : 0;
  if (a === null || b === null || a1 === null || b1 === null) {
    const falta = [esquerda, direita].find((op) => valorDe(op, ctx, cruzamento ? 1 : 0) === null) ?? esquerda;
    return { valor: false, explicacao: `dados insuficientes para ${rotulo(falta)}` };
  }
  const valor = {
    "<": a < b,
    "<=": a <= b,
    ">": a > b,
    ">=": a >= b,
    cruzouAcima: a1 <= b1 && a > b,
    cruzouAbaixo: a1 >= b1 && a < b,
  }[comparador];
  return {
    valor,
    explicacao: `${comValor(esquerda, a)} ${SIMBOLO[comparador]} ${comValor(direita, b)}: ${valor ? "sim" : "não"}`,
  };
}

/** Avalia a árvore inteira (sem atalho: a explicação mostra todas as condições). */
export function avaliar(regra: Regra, ctx: ContextoMercado): Resultado {
  switch (regra.tipo) {
    case "comparar":
      return comparar(regra, ctx);
    case "nao": {
      const r = avaliar(regra.regra, ctx);
      return { valor: !r.valor, explicacao: `não (${r.explicacao})` };
    }
    case "e":
    case "ou": {
      const filhos = regra.regras.map((r) => avaliar(r, ctx));
      const valor = regra.tipo === "e" ? filhos.every((f) => f.valor) : filhos.some((f) => f.valor);
      return {
        valor,
        explicacao: filhos.map((f) => `(${f.explicacao})`).join(regra.tipo === "e" ? " e " : " ou "),
      };
    }
  }
}

export const PROFUNDIDADE_MAXIMA = 12;
export const NOS_MAXIMOS = 200;

/**
 * Valida a árvore vinda da tela antes de gravar. A profundidade e o número de nós
 * têm teto: a avaliação é recursiva e roda a cada candle de cada robô.
 */
export function validarRegra(regra: Regra): string[] {
  const problemas = new Set<string>();
  let nos = 0;

  const operando = (op: Operando, prof: number): void => {
    nos++;
    if (prof > PROFUNDIDADE_MAXIMA) {
      problemas.add(`a regra passa da profundidade máxima (${PROFUNDIDADE_MAXIMA} níveis)`);
      return;
    }
    switch (op.tipo) {
      case "preco":
      case "abertura":
      case "maxima":
      case "minima":
      case "volume":
        return;
      case "numero":
        if (!Number.isFinite(op.valor)) problemas.add("o valor precisa ser um número finito");
        return;
      case "indicador":
        problemasIndicador(op).forEach((p) => problemas.add(p));
        return;
      case "multiplicar":
        if (!Number.isFinite(op.fator) || op.fator <= 0)
          problemas.add("o fator precisa ser um número positivo");
        operando(op.operando, prof + 1);
        return;
    }
  };

  const visitar = (r: Regra, prof: number): void => {
    nos++;
    if (prof > PROFUNDIDADE_MAXIMA) {
      problemas.add(`a regra passa da profundidade máxima (${PROFUNDIDADE_MAXIMA} níveis)`);
      return;
    }
    switch (r.tipo) {
      case "comparar":
        operando(r.esquerda, prof + 1);
        operando(r.direita, prof + 1);
        return;
      case "nao":
        visitar(r.regra, prof + 1);
        return;
      case "e":
      case "ou":
        if (r.regras.length === 0)
          problemas.add(`um grupo "${r.tipo.toUpperCase()}" precisa de pelo menos uma condição`);
        r.regras.forEach((f) => visitar(f, prof + 1));
        return;
    }
  };

  visitar(regra, 1);
  if (nos > NOS_MAXIMOS) problemas.add(`a regra tem ${nos} partes; o máximo é ${NOS_MAXIMOS}`);
  return [...problemas];
}

/**
 * A regra em texto, sem os valores do momento ("preço < fundo de Donchian(10)"): o
 * que o agente lê para saber como a posição vai sair. Mesmos rótulos da explicação.
 */
export function descreverRegra(regra: Regra): string {
  switch (regra.tipo) {
    case "comparar":
      return `${rotulo(regra.esquerda)} ${SIMBOLO[regra.comparador]} ${rotulo(regra.direita)}`;
    case "nao":
      return `não (${descreverRegra(regra.regra)})`;
    case "e":
    case "ou":
      return regra.regras.length === 1
        ? descreverRegra(regra.regras[0] as Regra)
        : regra.regras.map((r) => `(${descreverRegra(r)})`).join(regra.tipo === "e" ? " e " : " ou ");
  }
}
