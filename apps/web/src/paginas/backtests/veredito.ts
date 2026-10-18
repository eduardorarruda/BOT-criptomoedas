import type { Backtest } from "../../api/esquemas";
import { formatarDinheiro, formatarPercentual } from "../../lib/formatar";
import { anos } from "./formato";

/**
 * O "veredito" lista verificações verdes, amarelas e vermelhas sobre o backtest, em
 * português claro. Descreve o passado simulado; NUNCA recomenda investir ou operar.
 * Os cortes (100 operações, 5% de ruína, DSR 0,95…) são regras práticas; a tela diz isso.
 */
export type Tom = "verde" | "amarelo" | "vermelho";

export interface Checagem {
  readonly id: string;
  readonly tom: Tom;
  readonly titulo: string;
  readonly detalhe: string;
}

const OPERACOES_FIRMES = 100;
const OPERACOES_MINIMAS = 30;
const EMPATE_BUY_HOLD = 0.01;
const RUINA_BAIXA = 0.05;
const RUINA_ALTA = 0.2;
const DSR_FIRME = 0.95;
const DSR_DUVIDOSO = 0.5;
const JANELAS_BOAS = 0.6;
const JANELAS_RUINS = 0.4;

const pct = (f: number) => formatarPercentual(f, { sinal: true });
const checagem = (id: string, tom: Tom, titulo: string, detalhe: string): Checagem => ({
  id,
  tom,
  titulo,
  detalhe,
});

function lucro(b: Backtest): Checagem | null {
  const m = b.metricas;
  if (!m) return null;
  const r = m.resultadoPercentual;
  const quanto =
    (r === undefined ? "" : ` (${pct(r)})`) +
    (m.win ? "; ficar de fora daria R$ 0,00, sem custo nenhum" : "");
  return Number(m.resultadoLiquido) > 0
    ? checagem(
        "lucro",
        "verde",
        "Terminou no lucro depois dos custos",
        `Resultado líquido de taxas${quanto}.`,
      )
    : checagem(
        "lucro",
        "vermelho",
        "Não deu lucro depois dos custos",
        `Resultado líquido de taxas${quanto}.`,
      );
}

function buyHold(b: Backtest): Checagem | null {
  const m = b.metricas;
  if (m?.excessoSobreBuyHold === undefined || m.buyHoldResultadoPercentual === undefined) return null;
  if (m.win)
    return sessaoWin(m.resultadoPercentual ?? 0, m.buyHoldResultadoPercentual, m.excessoSobreBuyHold);
  const detalhe = `A estratégia fez ${pct(m.resultadoPercentual ?? 0)}; comprar e segurar fez ${pct(m.buyHoldResultadoPercentual)}, com os mesmos custos.`;
  if (m.excessoSobreBuyHold > 0)
    return checagem("buy_hold", "verde", "Bate o buy and hold depois dos custos", detalhe);
  if (m.excessoSobreBuyHold > -EMPATE_BUY_HOLD)
    return checagem("buy_hold", "amarelo", "Praticamente empata com o buy and hold", detalhe);
  return checagem("buy_hold", "vermelho", "Perde para o buy and hold", detalhe);
}

function operacoes(b: Backtest): Checagem | null {
  const n = b.metricas?.operacoes;
  if (n === undefined) return null;
  if (n >= OPERACOES_FIRMES)
    return checagem(
      "operacoes",
      "verde",
      `Mais de ${OPERACOES_FIRMES} operações`,
      `${n} operações fechadas.`,
    );
  if (n >= OPERACOES_MINIMAS)
    return checagem(
      "operacoes",
      "amarelo",
      `Entre ${OPERACOES_MINIMAS} e ${OPERACOES_FIRMES} operações`,
      `${n} operações: dá uma ideia, mas os números ainda mudam bastante.`,
    );
  return checagem(
    "operacoes",
    "vermelho",
    `Menos de ${OPERACOES_MINIMAS} operações`,
    `Só ${n}: pouco para separar padrão de sorte.`,
  );
}

function foraDaAmostra(b: Backtest): Checagem | null {
  const a = b.validacao?.amostra;
  if (!a) return null;
  const detalhe = `Dentro: ${pct(a.dentro.retorno)}; fora: ${pct(a.fora.retorno)}.`;
  if (a.fora.retorno <= 0)
    return checagem("fora", "vermelho", "Fora da amostra (OOS) não deu lucro", detalhe);
  if (a.degradou)
    return checagem("fora", "amarelo", "Fora da amostra (OOS) piorou", `${detalhe} ${a.motivo ?? ""}`.trim());
  return checagem("fora", "verde", "Fora da amostra (OOS) manteve o resultado", detalhe);
}

function walkForward(b: Backtest): Checagem | null {
  const w = b.validacao?.walkForward;
  if (!w || w.janelas.length === 0) return null;
  const positivas = Math.round(w.estabilidade.fracaoPositivas * w.janelas.length);
  const detalhe = `${positivas} de ${w.janelas.length} janelas de teste terminaram no lucro.`;
  if (w.estabilidade.fracaoPositivas >= JANELAS_BOAS)
    return checagem("janelas", "verde", "Lucro na maioria das janelas do walk-forward", detalhe);
  if (w.estabilidade.fracaoPositivas >= JANELAS_RUINS)
    return checagem("janelas", "amarelo", "Resultado irregular entre as janelas", detalhe);
  return checagem("janelas", "vermelho", "Prejuízo na maioria das janelas", detalhe);
}

function monteCarlo(b: Backtest): Checagem | null {
  if (!b.validacao) return null;
  const mc = b.validacao.monteCarlo;
  if (!mc)
    return checagem("ruina", "amarelo", "Sem Monte Carlo", "Poucas operações para reamostrar a sequência.");
  const detalhe = `Em ${mc.simulacoes} sequências sorteadas, ${formatarPercentual(mc.probabilidadeRuina)} perderam ${formatarPercentual(mc.limiteRuina, { casas: 0 })} ou mais do capital em algum momento.`;
  if (mc.probabilidadeRuina < RUINA_BAIXA)
    return checagem("ruina", "verde", "Risco de ruína baixo no Monte Carlo", detalhe);
  if (mc.probabilidadeRuina < RUINA_ALTA)
    return checagem("ruina", "amarelo", "Algum risco de ruína no Monte Carlo", detalhe);
  return checagem("ruina", "vermelho", "Risco de ruína alto no Monte Carlo", detalhe);
}

function sharpeDeflacionado(b: Backtest): Checagem | null {
  const t = b.tentativas;
  if (!t || t.sharpeDeflacionado === null) return null;
  const vezes = t.total === 1 ? "1 tentativa" : `${t.total} tentativas`;
  const detalhe = `Considerando ${vezes} desta estratégia, a chance de o Sharpe ser real (e não sorte) é de ${formatarPercentual(t.sharpeDeflacionado, { casas: 0 })}.`;
  if (t.sharpeDeflacionado >= DSR_FIRME)
    return checagem("dsr", "verde", "O Sharpe resiste ao número de tentativas", detalhe);
  if (t.sharpeDeflacionado >= DSR_DUVIDOSO)
    return checagem("dsr", "amarelo", "O Sharpe pode ser em parte sorte", detalhe);
  return checagem("dsr", "vermelho", "O Sharpe provavelmente é sorte", detalhe);
}

function periodo(b: Backtest): Checagem | null {
  const testado = b.metricas?.anos;
  if (testado === undefined) return null;
  const minimo = b.tentativas?.anosMinimos ?? null;
  if (minimo !== null && testado < minimo)
    return checagem(
      "periodo",
      "vermelho",
      "Período curto para tantas tentativas",
      `Com ${b.tentativas?.total ?? 0} tentativas, seriam precisos ${anos(minimo)} de dados para esse Sharpe não sair por acaso; o teste tem ${anos(testado)}.`,
    );
  if (testado >= 1)
    return checagem("periodo", "verde", "Período de 1 ano ou mais", `O teste cobre ${anos(testado)}.`);
  return checagem(
    "periodo",
    "amarelo",
    "Menos de 1 ano de dados",
    `O teste cobre ${anos(testado)}: talvez um só tipo de mercado.`,
  );
}

function limites(b: Backtest): Checagem {
  const c = b.configuracao;
  if (!c)
    return checagem(
      "limites",
      "amarelo",
      "Backtest antigo, de antes da validação",
      "Rodou sem deslizamento e sem os limites do robô: rode de novo para comparar.",
    );
  if (c.risco.modo === "sem_limites")
    return checagem(
      "limites",
      "amarelo",
      "Sem os limites de risco do robô",
      "Menos realista: o robô de verdade operaria menos.",
    );
  return checagem(
    "limites",
    "verde",
    "Com os limites de risco do robô",
    b.metricas?.win
      ? "Perda diária, frequência e pausa após perda valeram; no mini índice, a margem faz o papel da exposição."
      : "Perda diária, exposição, frequência e pausa após perda valeram.",
  );
}

/* ---------- mini índice (WIN) ---------- */

const CUSTOS_LEVES = 0.3;
const CUSTOS_PESADOS = 0.6;

function sessaoWin(estrategia: number, sessao: number, excesso: number): Checagem {
  const detalhe = `A estratégia fez ${pct(estrategia)}; ficar comprado com 1 contrato em toda sessão fez ${pct(sessao)}, com os mesmos custos. Ficar de fora fez 0%.`;
  if (excesso > 0)
    return checagem("buy_hold", "verde", "Bate o sempre comprado na sessão depois dos custos", detalhe);
  if (excesso > -EMPATE_BUY_HOLD)
    return checagem("buy_hold", "amarelo", "Praticamente empata com o sempre comprado na sessão", detalhe);
  return checagem("buy_hold", "vermelho", "Perde para o sempre comprado na sessão", detalhe);
}

/** Quanto do ganho bruto a tarifa, a corretagem e o deslizamento levaram. */
function custosWin(b: Backtest): Checagem | null {
  const w = b.metricas?.win;
  if (!w) return null;
  const quanto = `Tarifas e corretagem de ${formatarDinheiro(String(Number(w.custosB3) + Number(w.corretagem)), { moeda: "R$" })} e ${formatarDinheiro(w.deslizamentoPago, { moeda: "R$" })} de deslizamento.`;
  if (w.custosSobreBruto === null)
    return checagem("custos", "vermelho", "Sem ganho bruto: os custos só aumentaram a perda", quanto);
  const titulo = `Custos consomem ${formatarPercentual(w.custosSobreBruto, { casas: 0 })} do ganho bruto`;
  if (w.custosSobreBruto < CUSTOS_LEVES) return checagem("custos", "verde", titulo, quanto);
  if (w.custosSobreBruto < CUSTOS_PESADOS) return checagem("custos", "amarelo", titulo, quanto);
  return checagem("custos", "vermelho", titulo, quanto);
}

function irWin(b: Backtest): Checagem | null {
  const w = b.metricas?.win;
  if (!w) return null;
  const detalhe = `IR estimado de ${formatarDinheiro(w.irEstimado, { moeda: "R$" })} (20% do lucro de cada mês, prejuízo compensado). Estimativa, não é parecer tributário.`;
  return Number(w.liquidoDepoisDoIr) > 0
    ? checagem("ir", "verde", "Continua no lucro depois do IR estimado", detalhe)
    : checagem("ir", "vermelho", "Não sobra lucro depois do IR estimado", detalhe);
}

function dadosWin(b: Backtest): Checagem | null {
  const w = b.metricas?.win;
  if (!w) return null;
  if (w.aproximacao)
    return checagem(
      "dados",
      "amarelo",
      "Rodou na aproximação pelo Ibovespa, não no WIN",
      "O índice à vista não tem a base do futuro nem o horário completo do WIN; valide com dados reais do WIN.",
    );
  return checagem(
    "dados",
    "verde",
    "Rodou com candles do WIN de verdade",
    "Dados importados do próprio contrato.",
  );
}

function semEspacoWin(b: Backtest): Checagem | null {
  const w = b.metricas?.win;
  if (!w || w.semEspacoNoRisco === 0) return null;
  return checagem(
    "sem_espaco",
    "amarelo",
    `${w.semEspacoNoRisco} sinal(is) não couberam no risco`,
    "Nem 1 contrato cabia no risco por operação ou na margem: a estratégia operou menos que os sinais pediam.",
  );
}

export function veredito(b: Backtest): Checagem[] {
  return [
    lucro(b),
    irWin(b),
    custosWin(b),
    buyHold(b),
    dadosWin(b),
    semEspacoWin(b),
    operacoes(b),
    foraDaAmostra(b),
    walkForward(b),
    monteCarlo(b),
    sharpeDeflacionado(b),
    periodo(b),
    limites(b),
  ].filter((c): c is Checagem => c !== null);
}

/** Uma frase que conta, sem julgar: quantas verdes, amarelas e vermelhas. */
export function resumoDoVeredito(checagens: readonly Checagem[]): string {
  const conta = (t: Tom) => checagens.filter((c) => c.tom === t).length;
  const partes = [
    `${conta("verde")} verde${conta("verde") === 1 ? "" : "s"}`,
    `${conta("amarelo")} amarela${conta("amarelo") === 1 ? "" : "s"}`,
    `${conta("vermelho")} vermelha${conta("vermelho") === 1 ? "" : "s"}`,
  ];
  return `${checagens.length} verificações: ${partes.join(", ")}.`;
}
