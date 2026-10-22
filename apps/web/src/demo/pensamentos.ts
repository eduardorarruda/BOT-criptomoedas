import type {
  DecisaoDTO,
  LeituraCenarioDTO,
  PensamentoAtualDTO,
  PensamentoDTO,
  PensamentoHistoricoDTO,
  RoboDTO,
} from "@zentrade/contratos/esquemas";
import type { Condicao } from "@zentrade/dominio";

/**
 * O pensamento do robô no exemplo: um cenário por ativo (BTC em alta, ETH em queda, SOL e
 * BNB laterais), a regra aberta em condições, a conclusão e um histórico curto. Os números
 * seguem o mesmo critério do domínio (média de 200 velas, inclinação em 50 velas, limiar de
 * meio ATR), só que escritos à mão.
 */
const MIN = 60_000;
const HORA = 60 * MIN;

const leitura = (l: Omit<LeituraCenarioDTO, "texto">, texto: string): LeituraCenarioDTO => ({ ...l, texto });

export const CENARIOS_DEMO: Readonly<Record<string, LeituraCenarioDTO>> = {
  BTCUSDT: leitura(
    {
      cenario: "alta",
      precoVsSma200: 3.7,
      precoVsSma400: 6.2,
      inclinacaoSma200: 1.9,
      limiarInclinacao: 0.4,
      variacao7d: 4.8,
      janelaVariacaoHoras: 168,
      atrPct: 0.8,
      atrPercentil: 64,
      eficiencia: 0.41,
    },
    "Alta: o preço está 3,7% acima da média de 200 velas, que sobe 1,9% em 50 velas; em 7 dias andou +4,8%.",
  ),
  ETHUSDT: leitura(
    {
      cenario: "queda",
      precoVsSma200: -3.1,
      precoVsSma400: -5.4,
      inclinacaoSma200: -1.6,
      limiarInclinacao: 0.3,
      variacao7d: -2.2,
      janelaVariacaoHoras: 168,
      atrPct: 0.6,
      atrPercentil: 48,
      eficiencia: 0.33,
    },
    "Queda: o preço está 3,1% abaixo da média de 200 velas, que cai 1,6% em 50 velas; em 7 dias andou -2,2%.",
  ),
  SOLUSDT: leitura(
    {
      cenario: "lateral",
      precoVsSma200: -0.4,
      precoVsSma400: 1.1,
      inclinacaoSma200: 0.1,
      limiarInclinacao: 0.9,
      variacao7d: 0,
      janelaVariacaoHoras: 168,
      atrPct: 1.8,
      atrPercentil: 31,
      eficiencia: 0.08,
    },
    "Lateral: o preço está 0,4% abaixo da média de 200 velas, que está quase parada; em 7 dias andou 0%.",
  ),
  BNBUSDT: leitura(
    {
      cenario: "lateral",
      precoVsSma200: 0.6,
      precoVsSma400: -0.8,
      inclinacaoSma200: -0.1,
      limiarInclinacao: 0.35,
      variacao7d: 0.9,
      janelaVariacaoHoras: 168,
      atrPct: 0.7,
      atrPercentil: 22,
      eficiencia: 0.12,
    },
    "Lateral: o preço está 0,6% acima da média de 200 velas, que está quase parada; em 7 dias andou +0,9%.",
  ),
};

const folha = (valor: boolean, texto: string): Condicao => ({ tipo: "condicao", valor, texto });
const grupo = (tipo: "e" | "ou", filhos: Condicao[]): Condicao => ({
  tipo,
  valor: tipo === "e" ? filhos.every((f) => f.valor) : filhos.some((f) => f.valor),
  texto: tipo === "e" ? "todas estas" : "pelo menos uma destas",
  filhos,
});

/** A regra de entrada de cada robô do exemplo, com os valores do momento. */
const REGRAS: Readonly<Record<string, Condicao>> = {
  "r-btc": grupo("e", [
    folha(false, "RSI(14) (47,3) < 30"),
    folha(true, "preço (66.540,2) > SMA(200) (64.152,8)"),
  ]),
  "r-eth": grupo("e", [
    folha(false, "EMA(9) (2.388,4) cruzou acima de EMA(21) (2.391,9)"),
    {
      tipo: "nao",
      valor: true,
      texto: "nenhuma destas",
      filhos: [folha(false, "RSI(14) (41,6) > 70")],
    },
  ]),
  "r-sol": grupo("ou", [
    folha(false, "preço (148,9) > 1,02 × SMA(50) (150,3)"),
    folha(false, "preço cruzou acima de SMA(20) (149,2)"),
  ]),
  "r-bnb": grupo("e", [folha(false, "EMA(9) (587,2) cruzou acima de EMA(21) (586,8)")]),
};

const PRECO: Readonly<Record<string, string>> = {
  "r-btc": "66540.20",
  "r-eth": "2388.40",
  "r-sol": "148.90",
  "r-bnb": "587.20",
};

const MOTIVOS: Readonly<Record<string, string>> = {
  "r-btc": "não é verdade que RSI(14) (47,3) < 30",
  "r-eth": "não é verdade que EMA(9) (2.388,4) cruzou acima de EMA(21) (2.391,9)",
  "r-sol":
    "não é verdade que preço (148,9) > 1,02 × SMA(50) (150,3); não é verdade que preço cruzou acima de SMA(20) (149,2)",
  "r-bnb": "não é verdade que EMA(9) (587,2) cruzou acima de EMA(21) (586,8)",
};

const roboSemDemo = (robo: RoboDTO): boolean => !(robo.id in REGRAS);

/** A leitura mais recente do robô (ele fecha uma vela a cada intervalo; aqui, a última). */
export function pensamentoDoRobo(robo: RoboDTO, agora: number): PensamentoDTO | null {
  const cenario = CENARIOS_DEMO[robo.simbolo];
  if (!cenario || roboSemDemo(robo)) return null;
  const conclusao = `Fico de fora: ${MOTIVOS[robo.id]}.`;
  return {
    em: agora - 11 * MIN,
    preco: PRECO[robo.id] ?? "0",
    sinal: "AGUARDAR",
    posicionado: false,
    regraAvaliada: "entrada",
    condicoes: REGRAS[robo.id] ?? null,
    cenario,
    agente: robo.limites.agente,
    explicacao: conclusao.replace(/^Fico de fora: /, ""),
    conclusao,
  };
}

export function pensamentosIniciais(robos: readonly RoboDTO[], agora: number): PensamentoAtualDTO[] {
  return robos.flatMap((r) => {
    const pensamento = pensamentoDoRobo(r, agora);
    return pensamento ? [{ roboId: r.id, simbolo: r.simbolo, intervalo: r.intervalo, pensamento }] : [];
  });
}

/** Um ciclo da simulação: o mesmo robô, agora com o sinal que a simulação deu. */
export function pensamentoDoCiclo(
  base: PensamentoDTO,
  sinal: PensamentoDTO["sinal"],
  explicacao: string,
  preco: string,
  em: number,
): PensamentoDTO {
  const conclusao =
    sinal === "COMPRAR"
      ? `Compro: ${explicacao}. ${base.agente === "desligado" ? "Claude desligado: só a regra e o risco decidem." : "O Claude confere antes da ordem."}`
      : sinal === "VENDER"
        ? `Saio pelo alvo: ${explicacao}.`
        : base.conclusao;
  const condicoes =
    sinal === "COMPRAR" && base.condicoes
      ? { ...base.condicoes, valor: true, filhos: base.condicoes.filhos?.map((f) => ({ ...f, valor: true })) }
      : base.condicoes;
  return { ...base, em, preco, sinal, posicionado: sinal === "VENDER", condicoes, explicacao, conclusao };
}

/** As últimas mudanças do robô: a primeira leitura, uma virada de cenário e um sinal. */
export function historicoDemo(robo: RoboDTO, agora: number): PensamentoHistoricoDTO[] {
  const atual = pensamentoDoRobo(robo, agora);
  if (!atual) return [];
  const outro: LeituraCenarioDTO["cenario"] = atual.cenario.cenario === "alta" ? "lateral" : "alta";
  const antes = (h: number, extra: Partial<PensamentoDTO>): PensamentoDTO => ({
    ...atual,
    em: agora - h * HORA,
    ...extra,
  });
  return [
    {
      motivo: "sinal",
      pensamento: antes(9, {
        sinal: "COMPRAR",
        explicacao: "a regra de entrada deu sim",
        conclusao: "Compro: a regra de entrada deu sim. O Claude confere antes da ordem.",
        condicoes: atual.condicoes ? { ...atual.condicoes, valor: true } : null,
      }),
    },
    {
      motivo: "cenario",
      pensamento: antes(31, {
        cenario: {
          ...atual.cenario,
          cenario: outro,
          texto: atual.cenario.texto.replace(/^\w+/, outro === "alta" ? "Alta" : "Lateral"),
        },
      }),
    },
    { motivo: "inicio", pensamento: antes(52 * 2, { cenario: { ...atual.cenario, cenario: outro } }) },
  ];
}

/* ---------- cenário e condições gravados junto das decisões de exemplo ---------- */

const FOLHA = /\(([^()]*(?:\([^()]*\)[^()]*)*): (sim|não)\)/g;

/** As condições a partir da explicação da regra, "(A: sim) e (B: não)", como a decisão antiga as guardava. */
export function condicoesDaExplicacao(texto: string): Condicao | null {
  const achadas = [...texto.matchAll(FOLHA)].map((m) => {
    const valor = m[2] === "sim";
    const f = folha(valor, m[1] ?? "");
    const negada = texto.slice(Math.max(0, (m.index ?? 0) - 4), m.index) === "não ";
    return negada ? ({ tipo: "nao", valor: !valor, texto: "nenhuma destas", filhos: [f] } as Condicao) : f;
  });
  if (achadas.length === 0) return null;
  if (achadas.length === 1) return achadas[0] ?? null;
  return grupo(/\) ou \(/.test(texto) && !/\) e /.test(texto) ? "ou" : "e", achadas);
}

export function comRegimeDemo(decisoes: readonly DecisaoDTO[], robos: readonly RoboDTO[]): DecisaoDTO[] {
  return decisoes.map((d) => {
    const simbolo = robos.find((r) => r.id === d.roboId)?.simbolo ?? "";
    const regime = CENARIOS_DEMO[simbolo];
    const condicoes = d.sinal.acao === "COMPRAR" ? condicoesDaExplicacao(d.sinal.explicacao) : null;
    return { ...d, ...(regime ? { regime } : {}), ...(condicoes ? { condicoes } : {}) };
  });
}
