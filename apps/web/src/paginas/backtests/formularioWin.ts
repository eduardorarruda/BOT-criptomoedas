import {
  MS_POR_INTERVALO,
  SALDO_PADRAO_WIN,
  type CoberturaWin,
  type ConfiguracaoBacktestEntrada,
  type ModoExecucaoBacktest,
  type ConfiguracaoWinEntrada,
} from "@zentrade/contratos/esquemas";
import { problemasSessao } from "@zentrade/dominio";

/**
 * O formulário do mini índice (WIN): o que a pessoa digita, a leitura dos campos e a
 * configuração que vai para a API. Puro: a tela só liga os campos.
 */
export interface CamposWin {
  readonly tarifa: string;
  readonly corretagem: string;
  readonly ticks: string;
  readonly inicioEntradas: string;
  readonly fimEntradas: string;
  readonly zeragem: string;
  readonly pularLeilao: boolean;
  readonly capital: string;
  readonly risco: string;
  readonly contratos: string;
  readonly margem: string;
  readonly limites: "padrao" | "sem";
}

export const CAMPOS_WIN_INICIAIS: CamposWin = {
  tarifa: "0,25",
  corretagem: "0",
  ticks: "1",
  inicioEntradas: "09:15",
  fimEntradas: "17:30",
  zeragem: "18:15",
  pularLeilao: true,
  capital: SALDO_PADRAO_WIN,
  risco: "100",
  contratos: "5",
  margem: "155",
  limites: "padrao",
};

/** Reais digitados ("0,25", "1.234,50" ou "1234.5") em texto decimal, ou `null`. */
export function lerReais(texto: string, { positivo = false } = {}): string | null {
  const limpo = texto.trim().replace(/\s/g, "");
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  if (!Number.isFinite(n) || n > 10_000_000 || (positivo ? n <= 0 : n < 0)) return null;
  return normal;
}

export function lerInteiro(texto: string, minimo: number, maximo: number): number | null {
  const n = Number(texto.trim());
  return texto.trim() !== "" && Number.isInteger(n) && n >= minimo && n <= maximo ? n : null;
}

export type ErrosWin = Partial<Record<keyof CamposWin, string>>;

/** O que está errado em cada campo, com a frase para a pessoa. Vazio = pode rodar. */
export function errosWin(c: CamposWin): ErrosWin {
  const erros: ErrosWin = {};
  if (lerReais(c.tarifa) === null) erros.tarifa = "em reais, 0 ou mais (como 0,25)";
  if (lerReais(c.corretagem) === null) erros.corretagem = "em reais, 0 ou mais";
  if (lerInteiro(c.ticks, 0, 20) === null) erros.ticks = "de 0 a 20 ticks";
  if (lerReais(c.capital, { positivo: true }) === null) erros.capital = "em reais, maior que zero";
  if (lerReais(c.risco, { positivo: true }) === null) erros.risco = "em reais, maior que zero";
  if (lerInteiro(c.contratos, 1, 500) === null) erros.contratos = "de 1 a 500 contratos";
  if (lerReais(c.margem, { positivo: true }) === null) erros.margem = "em reais, maior que zero";
  const sessao = problemasSessao({
    inicioEntradas: c.inicioEntradas,
    fimEntradas: c.fimEntradas,
    zeragem: c.zeragem,
    pularLeilaoAbertura: c.pularLeilao,
  });
  if (sessao.length) erros.zeragem = sessao.join("; ");
  return erros;
}

export function configuracaoWinDoFormulario(
  c: CamposWin,
  validacao: NonNullable<ConfiguracaoBacktestEntrada["validacao"]>,
  execucao: ModoExecucaoBacktest = "fechamento",
): ConfiguracaoBacktestEntrada {
  const win: ConfiguracaoWinEntrada = {
    tarifaB3PorContrato: lerReais(c.tarifa) ?? "0.25",
    corretagemPorContrato: lerReais(c.corretagem) ?? "0",
    deslizamentoTicks: lerInteiro(c.ticks, 0, 20) ?? 1,
    inicioEntradas: c.inicioEntradas,
    fimEntradas: c.fimEntradas,
    zeragem: c.zeragem,
    pularLeilaoAbertura: c.pularLeilao,
    margemPorContrato: lerReais(c.margem, { positivo: true }) ?? "155",
    contratosMaximos: lerInteiro(c.contratos, 1, 500) ?? 5,
    riscoPorOperacao: lerReais(c.risco, { positivo: true }) ?? "100",
  };
  return {
    mercado: "win",
    saldoInicial: lerReais(c.capital, { positivo: true }) ?? SALDO_PADRAO_WIN,
    risco: c.limites === "sem" ? { modo: "sem_limites" } : { modo: "robo" },
    execucao,
    validacao,
    win,
  };
}

const DIA = 86_400_000;

/**
 * A janela do backtest no WIN: os dados importados podem terminar antes de hoje, então
 * o período termina no último candle gravado e começa `dias` antes (nunca antes do
 * primeiro candle). `null` se não há candles do símbolo nesse intervalo.
 */
export function janelaWin(
  cobertura: readonly CoberturaWin[],
  simbolo: CoberturaWin["simbolo"],
  intervalo: CoberturaWin["intervalo"],
  dias: number,
): { readonly inicio: number; readonly fim: number; readonly dados: CoberturaWin } | null {
  const dados = cobertura.find((c) => c.simbolo === simbolo && c.intervalo === intervalo);
  if (!dados) return null;
  const fim = dados.ultimo + MS_POR_INTERVALO[intervalo];
  return { inicio: Math.max(dados.primeiro, fim - dias * DIA), fim, dados };
}
