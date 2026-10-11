import type { DecisaoDTO, EstrategiaDTO, OrdemDTO, PosicaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { aplicarExecucao, dec, POSICAO_ZERADA, type Posicao } from "@zentrade/dominio";
import type {
  Automacao,
  Backtest,
  ContaCorretora,
  Documento,
  PontoPatrimonio,
  Resumo,
  TokenApi,
  Usuario,
} from "../api/esquemas";
import { maiorQueda, somar } from "../lib/metricas";
import {
  automacoesIniciais,
  contasIniciais,
  documentosIniciais,
  ESTRATEGIAS,
  robosIniciais,
  tokensIniciais,
} from "./dados";
import { backtestsIniciais, decisoesIniciais, ordensIniciais, patrimonioInicial } from "./historico";

/** Estado do exemplo, sempre substituído por cópias (nunca alterado no lugar). */
export interface EstadoDemo {
  readonly usuario: Usuario | null;
  readonly confirmadoAte: number;
  readonly paradaTotal: boolean;
  readonly estrategias: readonly EstrategiaDTO[];
  readonly robos: readonly RoboDTO[];
  readonly decisoes: readonly DecisaoDTO[];
  readonly ordens: readonly OrdemDTO[];
  readonly patrimonio: readonly PontoPatrimonio[];
  readonly backtests: readonly Backtest[];
  readonly documentos: readonly Documento[];
  readonly tokens: readonly TokenApi[];
  readonly contas: readonly ContaCorretora[];
  readonly automacoes: readonly Automacao[];
}

/** Resultado já realizado hoje antes do que acontecer ao vivo. */
const REALIZADO_HOJE = "-1.84";
const DIA = 86_400_000;

export function estadoInicialDemo(agora: number): EstadoDemo {
  return {
    usuario: null,
    confirmadoAte: 0,
    paradaTotal: false,
    estrategias: ESTRATEGIAS,
    robos: robosIniciais(agora),
    decisoes: decisoesIniciais(agora),
    ordens: ordensIniciais(agora),
    patrimonio: patrimonioInicial(agora),
    backtests: backtestsIniciais(agora),
    documentos: documentosIniciais(agora),
    tokens: tokensIniciais(agora),
    contas: contasIniciais(agora),
    automacoes: automacoesIniciais(agora),
  };
}

function ordensDoRobo(e: EstadoDemo, roboId: string): OrdemDTO[] {
  const decisoes = new Set(e.decisoes.filter((d) => d.roboId === roboId).map((d) => d.id));
  return e.ordens.filter((o) => decisoes.has(o.decisaoId)).sort((a, b) => a.criadaEm - b.criadaEm);
}

/** A posição é derivada das execuções, como no motor (domínio: aplicarExecucao). */
export function posicaoDerivada(e: EstadoDemo, roboId: string): Posicao {
  return ordensDoRobo(e, roboId).reduce(
    (p, o) =>
      o.execucoes.reduce(
        (acc, ex) =>
          aplicarExecucao(acc, {
            lado: o.lado,
            preco: dec(ex.preco),
            quantidade: dec(ex.quantidade),
            taxaCotacao: dec(ex.taxaCotacao),
            em: ex.em,
          }),
        p,
      ),
    POSICAO_ZERADA,
  );
}

export function posicaoDTO(e: EstadoDemo, roboId: string): PosicaoDTO {
  const robo = e.robos.find((r) => r.id === roboId);
  const p = posicaoDerivada(e, roboId);
  return {
    roboId,
    simbolo: robo?.simbolo ?? "",
    quantidade: p.quantidade.toFixed(),
    precoMedio: p.precoMedio.toFixed(8),
    resultadoRealizado: p.resultadoRealizado.toFixed(8),
    taxasPagas: p.taxasPagas.toFixed(8),
  };
}

export function resumoDemo(e: EstadoDemo, agora: number, precoDe: (simbolo: string) => string): Resumo {
  const abertas = e.robos
    .map((r) => ({ robo: r, p: posicaoDerivada(e, r.id) }))
    .filter((x) => x.p.quantidade.gt(0));
  const exposicao = abertas.reduce((t, x) => t.plus(x.p.quantidade.times(precoDe(x.robo.simbolo))), dec(0));
  const naoRealizado = abertas.reduce(
    (t, x) => t.plus(x.p.quantidade.times(dec(precoDe(x.robo.simbolo)).minus(x.p.precoMedio))),
    dec(0),
  );
  const hoje = (em: number): boolean => agora - em < DIA;
  const custos = e.decisoes.filter((d) => hoje(d.em) && d.custoIaUsd).map((d) => d.custoIaUsd ?? "0");
  const taxas = e.ordens
    .flatMap((o) => o.execucoes)
    .filter((x) => hoje(x.em))
    .map((x) => x.taxaCotacao);
  return {
    resultadoHoje: naoRealizado.plus(REALIZADO_HOJE).toFixed(2),
    exposicao: exposicao.toFixed(2),
    maiorQueda30d: maiorQueda(e.patrimonio.map((p) => p.valor)),
    robosAtivos: e.robos.filter((r) => !r.pausado).length,
    custoIaHoje: dec(somar(custos)).toFixed(4),
    paradaTotal: e.paradaTotal,
    taxasHoje: dec(somar(taxas)).toFixed(2),
  };
}

export const exposicaoAtual = (e: EstadoDemo, precoDe: (s: string) => string): string =>
  resumoDemo(e, 0, precoDe).exposicao;
