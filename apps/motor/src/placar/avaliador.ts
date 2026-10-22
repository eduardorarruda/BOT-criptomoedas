import {
  MS_POR_INTERVALO,
  type CandidataAvaliacao,
  type PortaPlacar,
  type Relogio,
} from "@zentrade/contratos";
import { candlesDeAquecimento } from "@zentrade/dominio";
import { candlesDoBanco, type CandlesDoBanco } from "../backtest/candles-historicos.js";
import type { Registro } from "../nucleo/tipos.js";
import { avaliarCandidata, OPCOES_PLACAR_PADRAO, type OpcoesPlacar, type VelasDaDecisao } from "./avaliar.js";

/**
 * O avaliador periódico do placar do Claude (processo `robos`). A cada rodada pega as
 * entradas que passaram pelo Claude e ainda não têm desfecho final, lê do banco os
 * candles em volta de cada uma (os mesmos que o robô gravou ao vivo; nenhuma chamada de
 * rede) e grava a avaliação. Idempotente: concluída não é reescrita; pendente é
 * revista na rodada seguinte, quando houver candles novos.
 */
export interface DependenciasAvaliador {
  readonly placar: PortaPlacar;
  readonly candles: Pick<CandlesDoBanco, "candles">;
  readonly relogio: Relogio;
  readonly registro: Registro;
}

export interface OpcoesAvaliador {
  /** Decisões por rodada. */
  readonly lote: number;
  /** Só decisões dos últimos N dias. */
  readonly janelaDias: number;
  /** Pendente avaliada há menos que isto espera a próxima rodada. */
  readonly revisarMs: number;
  readonly placar?: OpcoesPlacar;
}

export interface ResultadoRodada {
  readonly avaliadas: number;
  readonly concluidas: number;
  readonly falharam: number;
}

const DIA_MS = 86_400_000;

/** Candles do banco em volta do sinal: o aquecimento até ele e os que já fecharam depois. */
async function velasDe(
  d: DependenciasAvaliador,
  c: CandidataAvaliacao,
  o: OpcoesPlacar,
  agora: number,
): Promise<VelasDaDecisao> {
  const ms = MS_POR_INTERVALO[c.intervalo];
  const corte = c.em + 1;
  const consulta = { simbolo: c.simbolo, intervalo: c.intervalo };
  const antes = await candlesDoBanco(d.candles, {
    ...consulta,
    inicio: corte - candlesDeAquecimento(c.estrategia, o.aquecimento) * ms,
    fim: corte,
  });
  const depois = await candlesDoBanco(d.candles, {
    ...consulta,
    inicio: corte,
    fim: corte + o.horizonte * ms,
  });
  return { antes, depois: depois.filter((k) => k.fechamento < agora) };
}

/** Uma rodada: avalia até `lote` decisões, uma por vez; a falha de uma não para as outras. */
export async function avaliarPendentes(
  d: DependenciasAvaliador,
  o: OpcoesAvaliador,
): Promise<ResultadoRodada> {
  const placar = o.placar ?? OPCOES_PLACAR_PADRAO;
  const agora = d.relogio.agora();
  const candidatas = await d.placar.candidatas({
    desde: agora - o.janelaDias * DIA_MS,
    revisarAntesDe: agora - o.revisarMs,
    limite: o.lote,
  });
  let avaliadas = 0;
  let concluidas = 0;
  let falharam = 0;
  for (const c of candidatas) {
    try {
      const avaliacao = avaliarCandidata(c, await velasDe(d, c, placar, agora), agora, placar);
      await d.placar.gravar(avaliacao);
      avaliadas++;
      if (avaliacao.situacao === "concluida") concluidas++;
    } catch (erro) {
      falharam++;
      d.registro.warn({ decisaoId: c.decisaoId, erro }, "placar do Claude: não deu para avaliar a decisão");
    }
  }
  if (avaliadas > 0 || falharam > 0)
    d.registro.info({ avaliadas, concluidas, falharam }, "placar do Claude: decisões avaliadas");
  return { avaliadas, concluidas, falharam };
}

export interface AvaliadorLigado {
  parar(): Promise<void>;
}

/**
 * Roda uma vez na partida e depois a cada `intervaloMs`. Nunca duas rodadas juntas: se
 * a anterior não terminou, a vez é pulada. Uma rodada que falha inteira (banco fora)
 * vira aviso; a próxima tenta de novo.
 */
export function ligarAvaliador(
  d: DependenciasAvaliador,
  o: OpcoesAvaliador & { readonly intervaloMs: number },
): AvaliadorLigado {
  let rodando: Promise<void> | null = null;
  const rodar = () => {
    if (rodando) return;
    rodando = avaliarPendentes(d, o)
      .then(() => undefined)
      .catch((erro: unknown) =>
        d.registro.warn({ erro }, "placar do Claude: a rodada falhou; tenta de novo depois"),
      )
      .finally(() => {
        rodando = null;
      });
  };
  const timer = setInterval(rodar, o.intervaloMs);
  rodar();
  return {
    async parar() {
      clearInterval(timer);
      await rodando;
    },
  };
}
