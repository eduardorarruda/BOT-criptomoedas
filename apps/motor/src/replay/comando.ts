import type { PortaAgente } from "@zentrade/contratos";
import type { Candle, Valor } from "@zentrade/dominio";
import type { Armazem } from "./executar.js";
import { chaveDoSinal, executarReplay, type ResumoExecucao } from "./executar.js";
import { compararReplay, type SinalAvaliado } from "./comparacao.js";
import type { ArgumentosReplay } from "./argumentos.js";
import { ESTRATEGIA_P1, REPLAY_P1 } from "./p1.js";
import { pedidoDoReplay } from "./pedido.js";
import { relatorioMarkdown } from "./relatorio.js";
import { gerarSinais, type SinalReplay } from "./sinais.js";

export interface DependenciasComando {
  /** Candles de [inicio − aquecimento, dadosAte): da Binance real pública, com cache. */
  readonly candles: (simbolo: string, aquecimento: number) => Promise<Candle[]>;
  readonly agente: PortaAgente | null;
  readonly armazem: Armazem & { custoMedioDeAnalise?: () => Promise<Valor | null> };
  readonly escrever: (linha: string) => void;
  readonly escreverArquivo: (caminho: string, texto: string) => Promise<void>;
  readonly agora: () => number;
  readonly dadosAte: string;
  /** Só testes: o agente fixo não devolve cenários. */
  readonly aceitarSemCenarios?: boolean;
}

/** Custo por análise assumido quando o livro de gastos ainda não tem nenhuma. */
const CUSTO_ESTIMADO_PADRAO_USD = 0.5;
const FALHAS_SEGUIDAS_MAXIMAS = 5;

export interface ResultadoComando {
  readonly resumo: ResumoExecucao | null;
  readonly relatorio: string | null;
}

async function sinaisDoPar(
  simbolo: string,
  a: ArgumentosReplay,
  d: DependenciasComando,
): Promise<{ candles: Candle[]; sinais: SinalReplay[] }> {
  const candles = await d.candles(simbolo, REPLAY_P1.janelaIndicadores);
  const sinais = gerarSinais({
    simbolo,
    candles,
    estrategia: ESTRATEGIA_P1,
    inicio: a.inicioMs,
    fim: a.fimMs,
    nocionalUsd: REPLAY_P1.nocionalUsd,
    horizonte: REPLAY_P1.horizonte,
    janela: REPLAY_P1.janelaIndicadores,
    bpsContra: REPLAY_P1.bpsContra,
  });
  return { candles, sinais };
}

/** Os sinais analisados cujo desfecho da regra pura já está resolvido, prontos para comparar. */
function avaliados(
  analises: Awaited<ReturnType<Armazem["listar"]>>,
  sinais: readonly SinalReplay[],
): { lista: SinalAvaliado[]; semDesfecho: number } {
  const porChave = new Map(sinais.map((s) => [chaveDoSinal(s.simbolo, s.ate), s]));
  const lista: SinalAvaliado[] = [];
  let semDesfecho = 0;
  for (const a of analises) {
    const s = porChave.get(chaveDoSinal(a.simbolo, a.sinalEm));
    if (!s || s.desfecho.situacao !== "concluido") {
      semDesfecho++;
      continue;
    }
    lista.push({
      simbolo: a.simbolo,
      ate: a.sinalEm,
      aprovou: a.veredito === "aprovou",
      resultadoUsd: s.desfecho.resultado.toNumber(),
      retorno: s.desfecho.retorno,
    });
  }
  return { lista, semDesfecho };
}

/**
 * O comando do replay: gera os sinais da P1 (regra pura) por par, manda ao agente (com
 * `--confirmar`) e monta o RESULTADOS.md com a comparação regra pura × regra + Claude ×
 * acaso. Sem `--confirmar` só estima o custo. Nunca fala com corretora nem cria decisão.
 */
export async function rodarComando(a: ArgumentosReplay, d: DependenciasComando): Promise<ResultadoComando> {
  const porPar = new Map<string, Candle[]>();
  const sinais: SinalReplay[] = [];
  for (const simbolo of REPLAY_P1.simbolos) {
    const par = await sinaisDoPar(simbolo, a, d);
    porPar.set(simbolo, par.candles);
    sinais.push(...par.sinais);
    d.escrever(`${simbolo}: ${par.candles.length} candles, ${par.sinais.length} sinais`);
  }

  let resumo: ResumoExecucao | null = null;
  if (!a.soRelatorio) {
    if (!d.agente)
      throw new Error("defina AGENTE_URL e AGENTE_SEGREDO: o replay só roda contra o agente de verdade.");
    const medio = await d.armazem.custoMedioDeAnalise?.();
    resumo = await executarReplay(
      sinais,
      {
        execucao: a.execucao,
        maximo: a.maximo,
        custoMaximoUsd: a.custoMaximoUsd,
        confirmar: a.confirmar,
        paralelo: a.paralelo,
        custoEstimadoPorAnaliseUsd: medio?.toNumber() ?? CUSTO_ESTIMADO_PADRAO_USD,
        falhasSeguidasMaximas: FALHAS_SEGUIDAS_MAXIMAS,
        ...(d.aceitarSemCenarios ? { aceitarSemCenarios: true } : {}),
      },
      {
        agente: d.agente,
        armazem: d.armazem,
        escrever: d.escrever,
        pedidoDe: (s) =>
          pedidoDoReplay(
            s,
            porPar.get(s.simbolo) ?? [],
            ESTRATEGIA_P1,
            REPLAY_P1.historicoNoPedido,
            REPLAY_P1.intervalo,
          ),
      },
    );
    d.escrever(
      `Parou: ${resumo.parou}. Analisados agora: ${resumo.analisadosAgora}; falhas: ${resumo.falhas}; custo desta rodada US$ ${resumo.custoDestaRodadaUsd.toFixed(2)}; custo total da execução US$ ${resumo.custoTotalUsd.toFixed(2)}.`,
    );
  }

  const analises = await d.armazem.listar(a.execucao);
  if (analises.length === 0) return { resumo, relatorio: null };
  const { lista, semDesfecho } = avaliados(analises, sinais);
  const custoTotal = (await d.armazem.custoTotal(a.execucao)).toNumber();
  const relatorio = relatorioMarkdown({
    execucao: a.execucao,
    janela: `${a.inicio} a ${a.fim}`,
    simbolos: REPLAY_P1.simbolos,
    geradoEm: new Date(d.agora()).toISOString().slice(0, 10),
    dadosAte: d.dadosAte,
    sinaisNaJanela: sinais.length,
    analisados: analises.length,
    resolvidos: lista.length,
    sobraram: Math.max(0, sinais.length - analises.length),
    semDesfecho,
    custoTotalUsd: custoTotal,
    nocionalUsd: REPLAY_P1.nocionalUsd,
    comparacao: compararReplay(lista, {
      rodadas: REPLAY_P1.rodadasAleatorias,
      semente: REPLAY_P1.semente,
    }),
  });
  if (a.saida) {
    await d.escreverArquivo(a.saida, relatorio);
    d.escrever(`Relatório gravado em ${a.saida}`);
  }
  return { resumo, relatorio };
}
