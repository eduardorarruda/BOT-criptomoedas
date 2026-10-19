import { MS_POR_INTERVALO } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import type { ResumoDiaImportacaoB3 } from "@zentrade/contratos";
import { meiaNoiteB3 } from "./comandos.js";
import type { FonteBarrasMt5 } from "./fonte-mt5.js";
import { FUSO_B3, horaLocal, lerFuso, type Fuso } from "./fuso.js";
import { converterBarrasMt5 } from "./fuso-mt5.js";
import { gravarCandlesB3, type CandlesSubstituiveis, type ResumoGravacao } from "./importar.js";
import { noPregaoB3 } from "./pregao.js";
import { detectarSimboloContinuoWin } from "./simbolo-continuo-mt5.js";

export interface DependenciasAtualizacaoMt5 {
  readonly fonte: FonteBarrasMt5;
  readonly banco: CandlesSubstituiveis;
  readonly agora: () => number;
  /** Nome do contínuo nesta corretora (ex.: "WIN$N"); sem isso, tenta os candidatos conhecidos. */
  readonly simboloConfigurado?: string;
}

export interface PedidoAtualizacaoMt5 {
  /** Desde a última vela gravada (ou o início do histórico, na primeira vez): vira o início do dia. */
  readonly desde: number;
  readonly ate: number;
  /** Fuso do servidor; `null` = detectar dia a dia pela abertura (ver `converterBarrasMt5`). */
  readonly fusoServidor: Fuso | null;
}

export interface ResumoAtualizacaoMt5 extends ResumoGravacao {
  /** O símbolo contínuo que a corretora tinha (útil para a tela mostrar o que foi usado). */
  readonly simboloContinuo: string;
  readonly dias: readonly ResumoDiaImportacaoB3[];
}

const INTERVALO = "5m" as const;
const DIA = 86_400_000;
/** Cada pedido ao MT5 cobre até 30 dias: 2 anos de 5m (~56 mil barras) não vão numa resposta só. */
const JANELA_MS = 30 * DIA;
const SAO_PAULO = lerFuso(FUSO_B3);

const diaB3 = (instante: number): string => {
  const h = horaLocal(instante, SAO_PAULO);
  return `${h.ano}-${String(h.mes).padStart(2, "0")}-${String(h.dia).padStart(2, "0")}`;
};

/** O pedido começa na meia-noite de Brasília do dia de `desde`: dias sempre inteiros (a detecção do fuso precisa). */
const inicioDoDia = (instante: number): number => meiaNoiteB3(diaB3(instante));

function resumoPorDia(candles: readonly Candle[], contrato: string, agora: number): ResumoDiaImportacaoB3[] {
  const dias = new Map<string, number>();
  for (const k of candles) {
    if (!noPregaoB3(k.abertura) || k.fechamento >= agora) continue;
    const d = diaB3(k.abertura);
    dias.set(d, (dias.get(d) ?? 0) + 1);
  }
  return [...dias]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, velas]) => ({
      data,
      contrato,
      negocios: velas,
      negociosUsados: velas,
      gravados: { [INTERVALO]: velas },
    }));
}

/**
 * Busca as barras que faltam no `coletor-mt5` (em janelas de 30 dias), converte do
 * horário do servidor para UTC e grava como `WIN` em 5m (15m e 1h montados por
 * `gravarCandlesB3`, a mesma gravação idempotente do importador da B3). Upsert: rodar
 * de novo com o mesmo período não duplica nada. Só lê dados; nunca envia ordem.
 */
export async function atualizarWinMt5(
  d: DependenciasAtualizacaoMt5,
  p: PedidoAtualizacaoMt5,
): Promise<ResumoAtualizacaoMt5> {
  const simbolos = await d.fonte.simbolosWin();
  const simboloContinuo = detectarSimboloContinuoWin(simbolos, d.simboloConfigurado);
  const candles: Candle[] = [];
  for (let de = inicioDoDia(p.desde); de < p.ate; de += JANELA_MS) {
    const ate = Math.min(de + JANELA_MS, p.ate);
    const barras = await d.fonte.barras({ simbolo: simboloContinuo, intervalo: INTERVALO, de, ate });
    const utc = converterBarrasMt5(
      barras.map((b) => b.tempoServidorNaive),
      p.fusoServidor,
    );
    barras.forEach((b, i) => {
      const abertura = utc[i] as number;
      if (abertura < de || abertura >= ate) return; // a folga de um dia do pedido
      candles.push({
        abertura,
        fechamento: abertura + MS_POR_INTERVALO[INTERVALO] - 1,
        abre: dec(b.abre),
        maxima: dec(b.maxima),
        minima: dec(b.minima),
        fecha: dec(b.fecha),
        volume: dec(b.volume),
      });
    });
  }
  const agora = d.agora();
  const resumo = await gravarCandlesB3(d.banco, "WIN", INTERVALO, candles, { agora });
  return { ...resumo, simboloContinuo, dias: resumoPorDia(candles, simboloContinuo, agora) };
}
