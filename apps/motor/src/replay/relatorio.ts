import type { ComparacaoReplay, MetricasDoConjunto, Proporcao, Veredito } from "./comparacao.js";

export interface DadosDoRelatorio {
  readonly execucao: string;
  readonly janela: string;
  readonly simbolos: readonly string[];
  readonly geradoEm: string;
  readonly dadosAte: string;
  readonly sinaisNaJanela: number;
  readonly analisados: number;
  /** Analisados cujo desfecho da regra pura já está resolvido (entram na comparação). */
  readonly resolvidos: number;
  readonly sobraram: number;
  readonly semDesfecho: number;
  readonly custoTotalUsd: number;
  readonly nocionalUsd: number;
  readonly comparacao: ComparacaoReplay;
}

const num = (x: number | null, casas = 2) =>
  x === null || !Number.isFinite(x) ? "—" : x.toFixed(casas).replace(".", ",");
const sinal = (x: number | null, casas = 2) => (x === null ? "—" : `${x > 0 ? "+" : ""}${num(x, casas)}`);
const pct = (fracao: number | null, casas = 1) => (fracao === null ? "—" : `${num(fracao * 100, casas)}%`);
const intervalo = (p: Proporcao) =>
  `${pct(p.taxa)} (${p.acertos}/${p.total}; Wilson 95%: ${pct(p.intervalo.inferior)} a ${pct(p.intervalo.superior)})`;

const VEREDITOS: Readonly<Record<Veredito, string>> = {
  agrega:
    "O Claude AGREGA: o resultado das entradas que ele aprovou ficou acima do p95 do filtro aleatório de mesma taxa de aprovação.",
  tira: "O Claude TIRA: o resultado das entradas que ele aprovou ficou abaixo do p5 do filtro aleatório de mesma taxa de aprovação.",
  indistinguivel:
    "O Claude é INDISTINGUÍVEL DO ACASO: o resultado das entradas que ele aprovou ficou entre o p5 e o p95 do filtro aleatório de mesma taxa de aprovação.",
  sem_filtro:
    "SEM VEREDITO: o Claude aprovou todos ou nenhum dos sinais; não houve filtro para comparar com o acaso.",
};

const linha = (celulas: readonly string[]) => `| ${celulas.join(" | ")} |`;

function tabela(c: ComparacaoReplay, nocionalUsd: number): string[] {
  const a = c.aleatorio;
  const m = (campo: (x: MetricasDoConjunto) => string) => [campo(c.puro), campo(c.comClaude)];
  return [
    linha([
      "",
      "Regra pura (todos)",
      "Regra + Claude (aprovados)",
      a ? `Aleatório (${a.sorteadas} sorteados, média)` : "Aleatório",
    ]),
    linha(["---", "---:", "---:", "---:"]),
    linha(["Entradas", ...m((x) => String(x.n)), a ? String(a.sorteadas) : "—"]),
    linha(["Acerto (lucro > 0)", ...m((x) => pct(x.acerto)), pct(a?.acertoMedio ?? null)]),
    linha(["Ganho médio (%)", ...m((x) => sinal(x.ganhoMedioPct)), "—"]),
    linha(["Perda média (%)", ...m((x) => sinal(x.perdaMediaPct)), "—"]),
    linha([
      "Média por operação (%)",
      ...m((x) => sinal(x.mediaPct)),
      a && a.sorteadas > 0 ? sinal(a.mediaSomaPct / a.sorteadas) : "—",
    ]),
    linha(["Resultado líquido somado (%)", ...m((x) => sinal(x.somaPct)), sinal(a?.mediaSomaPct ?? null)]),
    linha([
      `Resultado líquido (US$, ${nocionalUsd} por operação)`,
      ...m((x) => sinal(x.somaUsd)),
      sinal(a?.mediaUsd ?? null),
    ]),
  ];
}

/** O RESULTADOS.md do replay: números, veredito e limites, nesta ordem. */
export function relatorioMarkdown(d: DadosDoRelatorio): string {
  const c = d.comparacao;
  const a = c.aleatorio;
  return [
    `# Replay do Claude sobre a P1 — ${d.execucao}`,
    "",
    `Gerado em ${d.geradoEm}. Janela dos sinais: ${d.janela}. Dados até ${d.dadosAte}. Pares: ${d.simbolos.join(", ")}.`,
    "",
    "## Veredito",
    "",
    `**${VEREDITOS[c.veredito]}**`,
    "",
    a
      ? `Resultado das aprovações: US$ ${sinal(c.comClaude.somaUsd)}; acaso (${a.rodadas} rodadas, ${a.sorteadas} entradas sorteadas): média US$ ${sinal(a.mediaUsd)}, p5 US$ ${sinal(a.p5Usd)}, p95 US$ ${sinal(a.p95Usd)}; o acaso igualou ou superou o Claude em ${pct(a.acasoIgualouOuMelhorou)} das rodadas.`
      : "",
    `Contra a regra pura (entrar em todos): ${sinal(c.diferencaParaPuroUsd)} US$ (regra + Claude menos regra pura).`,
    "",
    "## Comparação",
    "",
    ...tabela(c, d.nocionalUsd),
    "",
    "## Precisão do Claude",
    "",
    `- Aprovações certas (a entrada deu lucro líquido): ${intervalo(c.aprovacoes)}.`,
    `- Vetos certos (a entrada vetada teria dado prejuízo ou zero): ${intervalo(c.vetos)}.`,
    `- Taxa de aprovação: ${pct(c.taxaDeAprovacao)}.`,
    `- As entradas que ele vetou somariam US$ ${sinal(c.vetados.somaUsd)} (${c.vetados.n} sinais; acerto ${pct(c.vetados.acerto)}).`,
    "",
    "## Contagens e custo",
    "",
    `- Sinais da P1 na janela: ${d.sinaisNaJanela}. Analisados pelo Claude: ${d.analisados}. Sobraram sem análise (passaram do máximo): ${d.sobraram}.`,
    `- Entram na comparação (desfecho da regra pura resolvido): ${d.resolvidos}. Ficaram de fora por posição ainda aberta nos dados: ${d.semDesfecho}.`,
    `- Custo gasto com o agente nesta rodada: US$ ${num(d.custoTotalUsd)}.`,
    "",
    "## Como foi medido",
    "",
    "- Estratégia P1: Donchian 20/10 (modelo `donchian-20-10`) com a regra extra preço > SMA(200) na entrada; uma posição por vez em cada par (um sinal novo só depois da saída da regra pura).",
    '- Cada sinal foi enviado ao agente com as velas só até o fechamento do candle do sinal e o instante dele como "agora"; o histórico de decisões e a base de conhecimento ficam desligados no replay (nada posterior ao sinal pode entrar).',
    "- Aprovou = a proposta final do agente é comprar, com a regra dos cenários aprovada (valor esperado > 0, cenário favorável no limiar) e sem veto grave. O resto é veto.",
    "- Desfecho de cada sinal: o mesmo para quem foi aprovado e para quem foi vetado. Entrada na abertura do candle seguinte, com deslizamento e meio spread (7 pontos-base por lado) e taxa de 0,1% por lado; saída pelo stop (2 ATR, teto 10%), alvo, regra de saída do Donchian ou horizonte de 500 candles, avaliada candle a candle (stop e alvo no mesmo candle contam o stop).",
    `- Mesmo tamanho em toda operação (US$ ${d.nocionalUsd}), para somar dinheiro. O acaso sorteia, sem repetição, tantas entradas quanto o Claude aprovou (semente fixa).`,
    "- Regra do veredito, fixada antes dos resultados: acima do p95 do acaso = agrega; abaixo do p5 = tira; entre os dois = indistinguível.",
    "",
    "## Limites",
    "",
    "- Uma janela só (julho a outubro de 2026), uma estratégia e um modelo: o veredito vale para este recorte, não para qualquer mercado.",
    "- Sinais de um mesmo dia em vários pares são correlacionados (o mercado cripto anda junto): a amostra efetiva é menor que o número de sinais.",
    "- O replay não tem orçamento de risco, saldo nem exposição: o agente analisa sem eles, como se a conta estivesse zerada.",
    "- A regra pura anda um sinal por vez; entradas que o Claude veta não mudam os sinais seguintes (o mesmo conjunto é avaliado nas duas pontas).",
    "- Candles da Binance real pública, em cache; entrada exata na abertura seguinte, sem fila nem liquidez limitada.",
    "- O Claude Code CLI do usuário roda com as ferramentas de mercado do pedido; sem acesso a notícias do período.",
    "",
  ]
    .filter((l, i, todas) => !(l === "" && todas[i - 1] === ""))
    .join("\n");
}
