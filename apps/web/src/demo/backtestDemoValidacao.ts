import type {
  AvisoBacktest,
  MonteCarlo,
  ResumoTrecho,
  ValidacaoBacktest,
  ValidacaoPedido,
} from "@zentrade/contratos/esquemas";
import { momentos, percentil } from "@zentrade/financas";
import { criarAleatorio } from "./aleatorio";

/**
 * Validação do backtest de exemplo: a mesma ideia do motor (apps/motor/src/backtest/
 * validacao), em contas simples sobre a série sintética. Só para o modo de demonstração.
 */
export interface SerieDemo {
  readonly em: readonly number[];
  readonly patrimonio: readonly number[];
  readonly buyHold: readonly number[];
  readonly operacoes: readonly {
    readonly abertaEm: number;
    readonly fechadaEm: number;
    readonly retorno: number;
  }[];
  readonly porAno: number;
  readonly capital: number;
}

export function sharpeDe(retornos: readonly number[], porAno: number): number | null {
  const m = momentos(retornos);
  return m.n >= 2 && m.desvio > 0 ? (m.media / m.desvio) * Math.sqrt(porAno) : null;
}

export function maiorQuedaDe(valores: readonly number[]): number {
  let pico = Number.NEGATIVE_INFINITY;
  let pior = 0;
  for (const v of valores) {
    pico = Math.max(pico, v);
    pior = Math.max(pior, pico > 0 ? 1 - v / pico : 0);
  }
  return pior;
}

export const retornosDe = (base: number, valores: readonly number[]): number[] =>
  valores.map((v, i) => v / (i === 0 ? base : (valores[i - 1] ?? base)) - 1);

function trecho(s: SerieDemo, inicio: number, fim: number): ResumoTrecho {
  const de = s.em.findIndex((t) => t >= inicio);
  const primeiro = de === -1 ? s.em.length : de;
  const ate = s.em.findIndex((t) => t >= fim);
  const ultimo = ate === -1 ? s.em.length : ate;
  const base = s.patrimonio[primeiro - 1] ?? s.capital;
  const pontos = s.patrimonio.slice(primeiro, ultimo);
  const baseBh = s.buyHold[primeiro - 1] ?? s.capital;
  const bh = s.buyHold.slice(primeiro, ultimo);
  const ops = s.operacoes.filter((o) => o.fechadaEm >= inicio && o.fechadaEm < fim);
  return {
    inicio,
    fim,
    retorno: (pontos.at(-1) ?? base) / base - 1,
    sharpe: sharpeDe(retornosDe(base, pontos), s.porAno),
    maiorQuedaPercentual: maiorQuedaDe([base, ...pontos]),
    operacoes: ops.length,
    taxaAcerto: ops.length === 0 ? null : ops.filter((o) => o.retorno > 0).length / ops.length,
    buyHoldRetorno: (bh.at(-1) ?? baseBh) / baseBh - 1,
  };
}

function amostra(s: SerieDemo, inicio: number, fim: number, f: number): ValidacaoBacktest["amostra"] {
  const corte = Math.round(inicio + (fim - inicio) * f);
  const dentro = trecho(s, inicio, corte);
  const fora = trecho(s, corte, fim);
  const inverteu = dentro.retorno > 0 && fora.retorno < 0;
  const caiu = (dentro.sharpe ?? 0) > 0 && (fora.sharpe ?? 0) < (dentro.sharpe ?? 0) / 2;
  const motivo = inverteu
    ? "o lucro de dentro da amostra virou prejuízo fora dela"
    : caiu
      ? "o Sharpe fora da amostra caiu para menos da metade do de dentro"
      : null;
  return { fracaoDentro: f, corte, dentro, fora, degradou: motivo !== null, motivo };
}

function walkForward(
  s: SerieDemo,
  inicio: number,
  fim: number,
  v: ValidacaoPedido,
): ValidacaoBacktest["walkForward"] {
  const razao = v.fracaoDentroDaAmostra / (1 - v.fracaoDentroDaAmostra);
  const fora = (fim - inicio) / (v.janelas + razao);
  const dentro = fora * razao;
  const janelas = Array.from({ length: v.janelas }, (_, i) => {
    const comeco = Math.round(inicio + dentro + i * fora);
    const ini = v.modoJanelas === "ancorada" ? inicio : Math.round(comeco - dentro);
    const d = trecho(s, ini, comeco);
    const f = trecho(s, comeco, i === v.janelas - 1 ? fim : Math.round(comeco + fora));
    const eficiencia =
      d.retorno > 0 ? f.retorno / (f.fim - f.inicio) / (d.retorno / (d.fim - d.inicio)) : null;
    return { indice: i, dentro: d, fora: f, eficiencia };
  });
  const r = momentos(janelas.map((j) => j.fora.retorno));
  const sharpes = janelas.map((j) => j.fora.sharpe).filter((x): x is number => x !== null);
  const sm = momentos(sharpes);
  const efs = janelas.map((j) => j.eficiencia).filter((x): x is number => x !== null);
  return {
    modo: v.modoJanelas,
    janelas,
    estabilidade: {
      mediaRetorno: r.media,
      desvioRetorno: r.desvio,
      mediaSharpe: sharpes.length ? sm.media : null,
      desvioSharpe: sharpes.length ? sm.desvio : null,
      fracaoPositivas: janelas.filter((j) => j.fora.retorno > 0).length / janelas.length,
      eficienciaMedia: efs.length ? efs.reduce((a, b) => a + b, 0) / efs.length : null,
    },
  };
}

const faixa = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  return { p5: percentil(o, 0.05), p50: percentil(o, 0.5), p95: percentil(o, 0.95) };
};

function monteCarlo(retornos: readonly number[], v: ValidacaoPedido): MonteCarlo | null {
  const n = retornos.length;
  if (n < 5) return null;
  const sortear = criarAleatorio(v.semente);
  const pontos = Array.from({ length: Math.min(n + 1, 40) }, (_, i) => Math.round((i * n) / Math.min(n, 39)));
  const caminhos = pontos.map(() => [] as number[]);
  const finais: number[] = [];
  const quedas: number[] = [];
  let ruinas = 0;
  for (let s = 0; s < v.simulacoes; s++) {
    let p = 1;
    let pico = 1;
    let pior = 0;
    let ruiu = false;
    for (let j = 0; j <= n; j++) {
      if (j > 0) p *= 1 + (retornos[Math.floor(sortear() * n)] ?? 0);
      pico = Math.max(pico, p);
      pior = Math.max(pior, 1 - p / pico);
      if (p <= 1 - v.limiteRuina) ruiu = true;
      pontos.forEach((ponto, k) => (ponto === j ? caminhos[k]?.push(p) : undefined));
    }
    finais.push(p - 1);
    quedas.push(pior);
    if (ruiu) ruinas++;
  }
  const min = Math.min(...finais);
  const largura = (Math.max(...finais) - min) / 20 || 1;
  const histograma = Array.from({ length: 20 }, (_, i) => ({
    de: min + i * largura,
    ate: min + (i + 1) * largura,
    quantidade: finais.filter((x) => Math.min(19, Math.floor((x - min) / largura)) === i).length,
  }));
  return {
    simulacoes: v.simulacoes,
    semente: v.semente,
    limiteRuina: v.limiteRuina,
    operacoes: n,
    retornoFinal: faixa(finais),
    maiorQueda: faixa(quedas),
    probabilidadeRuina: ruinas / v.simulacoes,
    histograma,
    leque: pontos.map((operacao, k) => ({ operacao, ...faixa(caminhos[k] ?? [1]) })),
  };
}

function avisos(operacoes: number, dias: number, semLimites: boolean): AvisoBacktest[] {
  const a = (codigo: string, nivel: AvisoBacktest["nivel"], mensagem: string): AvisoBacktest => ({
    codigo,
    nivel,
    base: "heuristica",
    mensagem,
  });
  return [
    ...(operacoes < 30
      ? [
          a(
            "poucas_operacoes",
            "alerta",
            `Só ${operacoes} operações. Abaixo de ~30, a taxa de acerto e a média mudam muito com uma operação a mais ou a menos.`,
          ),
        ]
      : operacoes < 100
        ? [
            a(
              "operacoes_moderadas",
              "atencao",
              `${operacoes} operações dão uma ideia; mais de 100 dariam números mais firmes.`,
            ),
          ]
        : []),
    ...(dias < 365
      ? [
          a(
            "menos_de_um_ano",
            "atencao",
            `O período tem ${Math.round(dias)} dias, menos de 1 ano: o teste pode ter visto um só tipo de mercado.`,
          ),
        ]
      : []),
    ...(semLimites
      ? [
          a(
            "sem_limites",
            "atencao",
            "Rodou sem os limites de risco do robô (perda diária, exposição, frequência, pausa): o robô de verdade operaria menos.",
          ),
        ]
      : []),
  ];
}

export function validacaoDemo(
  s: SerieDemo,
  periodo: { readonly inicio: number; readonly fim: number },
  v: ValidacaoPedido,
  semLimites: boolean,
): ValidacaoBacktest {
  return {
    amostra: amostra(s, periodo.inicio, periodo.fim, v.fracaoDentroDaAmostra),
    walkForward: walkForward(s, periodo.inicio, periodo.fim, v),
    monteCarlo: monteCarlo(
      s.operacoes.map((o) => o.retorno),
      v,
    ),
    avisos: avisos(s.operacoes.length, (periodo.fim - periodo.inicio) / 86_400_000, semLimites),
  };
}
