import type { DecisaoDTO, OrdemDTO } from "@zentrade/contratos/esquemas";
import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos/esquemas";
import type { CandlestickData, SeriesMarker, UTCTimestamp } from "lightweight-charts";
import type { CandleApi } from "../../api/esquemas";
import type { CoresGrafico } from "./cores";

/**
 * Conversões para o gráfico de candles. O gráfico precisa de número: a conversão
 * acontece só aqui, para desenhar — nenhuma conta de dinheiro sai daqui.
 */
export const segundos = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

export function paraVela(c: CandleApi): CandlestickData<UTCTimestamp> {
  return {
    time: segundos(c.abertura),
    open: Number(c.abre),
    high: Number(c.maxima),
    low: Number(c.minima),
    close: Number(c.fecha),
  };
}

/** Atualiza a última vela com o preço novo ou abre a próxima, se o intervalo virou. */
export function velaComPreco(
  ultima: CandlestickData<UTCTimestamp>,
  preco: number,
  em: number,
  intervalo: Intervalo,
): CandlestickData<UTCTimestamp> {
  const passo = MS_POR_INTERVALO[intervalo];
  const abertura = segundos(Math.floor(em / passo) * passo);
  if (abertura > ultima.time)
    return {
      time: abertura,
      open: ultima.close,
      high: Math.max(ultima.close, preco),
      low: Math.min(ultima.close, preco),
      close: preco,
    };
  return { ...ultima, high: Math.max(ultima.high, preco), low: Math.min(ultima.low, preco), close: preco };
}

export interface EstiloMarcador {
  readonly rotulo: string;
  /** Na mesma vela, a marca mais importante representa o grupo. */
  readonly prioridade: number;
  readonly forma: SeriesMarker<UTCTimestamp>["shape"];
  readonly posicao: "aboveBar" | "belowBar";
  readonly cor: keyof CoresGrafico;
}

/** Como cada decisão aparece no gráfico (a legenda abaixo usa os mesmos rótulos). */
export function estiloDecisao(d: DecisaoDTO): EstiloMarcador {
  const compra = d.sinal.acao !== "VENDER";
  const posicao = compra ? "belowBar" : "aboveBar";
  switch (d.estado) {
    case "executada":
    case "aprovada":
      return {
        rotulo: compra ? "Compra" : "Venda",
        prioridade: 5,
        forma: compra ? "arrowUp" : "arrowDown",
        posicao,
        cor: compra ? "marca" : "texto",
      };
    case "barrada":
      return { rotulo: "Barrada", prioridade: 2, forma: "circle", posicao, cor: "atencao" };
    case "aguardando_aprovacao":
      return { rotulo: "Aguarda você", prioridade: 4, forma: "square", posicao, cor: "atencao" };
    case "falhou":
      return { rotulo: "Falhou", prioridade: 3, forma: "circle", posicao, cor: "perda" };
    default:
      return { rotulo: "Só registro", prioridade: 1, forma: "circle", posicao, cor: "apagado" };
  }
}

interface Marca {
  readonly time: UTCTimestamp;
  readonly estilo: EstiloMarcador;
}

/** Texto do grupo: "Compra", "Compra ×3" ou "Compra +2" (com outras marcas na vela). */
function textoDoGrupo(grupo: readonly Marca[], principal: EstiloMarcador): string {
  // "Só registro" fica sem texto para não poluir: o círculo cinza e a legenda bastam.
  const rotulo = principal.cor === "apagado" ? "" : principal.rotulo;
  if (grupo.length === 1) return rotulo;
  const iguais = grupo.every((m) => m.estilo.rotulo === principal.rotulo);
  if (iguais) return rotulo ? `${rotulo} ×${grupo.length}` : `×${grupo.length}`;
  return `${rotulo || principal.rotulo} +${grupo.length - 1}`;
}

/**
 * Várias marcas na mesma vela e do mesmo lado viram uma só, com a contagem: em
 * intervalos longos, as decisões de um dia caíam todas no mesmo candle e os textos
 * se sobrepunham. A marca mais importante (execução > aguarda > falhou > barrada >
 * registro) dá a forma e a cor.
 */
export function agruparPorVela(
  marcas: readonly Marca[],
  cores: CoresGrafico,
  compacto = false,
): SeriesMarker<UTCTimestamp>[] {
  const grupos = new Map<string, { time: UTCTimestamp; marcas: Marca[] }>();
  for (const m of marcas) {
    const chave = `${m.time}:${m.estilo.posicao}`;
    const grupo = grupos.get(chave) ?? { time: m.time, marcas: [] };
    grupos.set(chave, { time: m.time, marcas: [...grupo.marcas, m] });
  }
  return [...grupos.values()]
    .map(({ time, marcas: grupo }) => {
      const principal = grupo.reduce((a, b) => (b.estilo.prioridade > a.estilo.prioridade ? b : a)).estilo;
      return {
        time,
        position: principal.posicao,
        shape: principal.forma,
        color: cores[principal.cor],
        // Compacto (tela estreita): só a contagem, os rótulos se atropelariam.
        text: compacto ? (grupo.length > 1 ? String(grupo.length) : "") : textoDoGrupo(grupo, principal),
      };
    })
    .sort((a, b) => a.time - b.time);
}

const inicioDaVela = (em: number, intervalo: Intervalo): UTCTimestamp => {
  const passo = MS_POR_INTERVALO[intervalo];
  return segundos(Math.floor(em / passo) * passo);
};

export function marcadores(
  decisoes: readonly DecisaoDTO[],
  intervalo: Intervalo,
  cores: CoresGrafico,
  inicio: number,
  compacto = false,
): SeriesMarker<UTCTimestamp>[] {
  const marcas = decisoes
    .filter((d) => d.em >= inicio)
    .map((d) => ({ time: inicioDaVela(d.em, intervalo), estilo: estiloDecisao(d) }));
  return agruparPorVela(marcas, cores, compacto);
}

const ESTILO_EXECUCAO: Record<OrdemDTO["lado"], EstiloMarcador> = {
  COMPRA: { rotulo: "Compra", prioridade: 5, forma: "arrowUp", posicao: "belowBar", cor: "marca" },
  VENDA: { rotulo: "Venda", prioridade: 5, forma: "arrowDown", posicao: "aboveBar", cor: "texto" },
};

/** Compras e vendas executadas (pelas execuções da corretora), agrupadas por vela. */
export function marcadoresExecucoes(
  ordens: readonly OrdemDTO[],
  intervalo: Intervalo,
  cores: CoresGrafico,
  inicio: number,
  compacto = false,
): SeriesMarker<UTCTimestamp>[] {
  const marcas = ordens.flatMap((o) =>
    o.execucoes
      .filter((x) => x.em >= inicio)
      .map((x) => ({ time: inicioDaVela(x.em, intervalo), estilo: ESTILO_EXECUCAO[o.lado] })),
  );
  return agruparPorVela(marcas, cores, compacto);
}
