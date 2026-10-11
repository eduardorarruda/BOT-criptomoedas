import { formatarNumero } from "./formatar.js";
import { ema, rsi, sma } from "./indicadores.js";

/**
 * A estratégia é uma árvore: grupos E / OU / NÃO com comparações nas folhas. O
 * construtor visual da tela monta essa árvore; aqui ela é avaliada — e explicada —
 * recursivamente, porque a estrutura é recursiva. A explicação sai do mesmo
 * percurso que a decisão, então nunca diverge dela.
 */
export type Indicador = "sma" | "ema" | "rsi";

export type Operando =
  | { readonly tipo: "preco" }
  | { readonly tipo: "numero"; readonly valor: number }
  | { readonly tipo: "indicador"; readonly nome: Indicador; readonly periodo: number }
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

/** Fechamentos de candles já fechados, do mais antigo ao mais recente. */
export interface ContextoMercado {
  readonly fechamentos: readonly number[];
}

export interface Resultado {
  readonly valor: boolean;
  readonly explicacao: string;
}

const CALCULO: Record<
  Indicador,
  (v: readonly number[], periodo: number, deslocamento: number) => number | null
> = {
  sma,
  ema,
  rsi,
};

const SIMBOLO: Record<Comparador, string> = {
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  cruzouAcima: "cruzou acima de",
  cruzouAbaixo: "cruzou abaixo de",
};

export function rotulo(op: Operando): string {
  switch (op.tipo) {
    case "preco":
      return "preço";
    case "numero":
      return formatarNumero(op.valor);
    case "indicador":
      return `${op.nome.toUpperCase()}(${op.periodo})`;
    case "multiplicar":
      return `${formatarNumero(op.fator)} × ${rotulo(op.operando)}`;
  }
}

function valorDe(op: Operando, ctx: ContextoMercado, deslocamento: number): number | null {
  switch (op.tipo) {
    case "preco":
      return ctx.fechamentos[ctx.fechamentos.length - 1 - deslocamento] ?? null;
    case "numero":
      return op.valor;
    case "indicador":
      return CALCULO[op.nome](ctx.fechamentos, op.periodo, deslocamento);
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
const PERIODO_MAXIMO = 500;

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
        return;
      case "numero":
        if (!Number.isFinite(op.valor)) problemas.add("o valor precisa ser um número finito");
        return;
      case "indicador":
        if (!Number.isInteger(op.periodo) || op.periodo < 1 || op.periodo > PERIODO_MAXIMO)
          problemas.add(
            `o período de ${op.nome.toUpperCase()} precisa ser inteiro entre 1 e ${PERIODO_MAXIMO}`,
          );
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
