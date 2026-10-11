import type { EstadoIndicador, PontoIndicador } from "@zentrade/banco";
import { SERIES_INDICADOR, type SerieIndicador } from "@zentrade/contratos";
import { FONTES_INDICES, somarDias } from "@zentrade/financas";
import type { ClienteBcb } from "./bcb.js";

/**
 * Mantém o cache das séries do Banco Central no banco. Na primeira vez busca desde
 * 2015; depois, só a cauda (com 10 dias de folga para revisões). Falha numa série
 * fica registrada nela e não impede as outras.
 */
export const DESDE_PADRAO = "2015-01-01";
const FOLGA_DIAS = 10;
export const INTERVALO_ATUALIZACAO_MS = 6 * 3_600_000;

export interface ArmazemIndicadores {
  gravar(serie: SerieIndicador, pontos: readonly PontoIndicador[]): Promise<number>;
  registrarVerificacao(serie: SerieIndicador, em: Date, erro: string | null): Promise<void>;
  estado(): Promise<EstadoIndicador[]>;
}

export interface LogAtualizador {
  warn(obj: object, msg: string): void;
}

export interface ResultadoAtualizacao {
  readonly serie: SerieIndicador;
  readonly novos: number;
  readonly erro: string | null;
}

export interface AtualizadorIndicadores {
  atualizar(): Promise<ResultadoAtualizacao[]>;
  /** Roda agora e a cada `intervaloMs`; devolve a função que para. */
  agendar(intervaloMs?: number): () => void;
}

export interface OpcoesAtualizador {
  readonly cliente: ClienteBcb;
  readonly armazem: ArmazemIndicadores;
  readonly agora: () => number;
  readonly log: LogAtualizador;
}

/** Dia de hoje em UTC: o SGS aceita pedir um dia à frente; o que não existe não vem. */
const hojeUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function criarAtualizadorIndicadores(o: OpcoesAtualizador): AtualizadorIndicadores {
  let emAndamento: Promise<ResultadoAtualizacao[]> | null = null;

  async function atualizarSerie(serie: SerieIndicador, ultimo: string | null): Promise<ResultadoAtualizacao> {
    const ate = hojeUtc(o.agora());
    const de = ultimo ? somarDias(ultimo, -FOLGA_DIAS) : DESDE_PADRAO;
    try {
      const pontos = await o.cliente.serie(FONTES_INDICES[serie].serie, de, ate);
      const novos = await o.armazem.gravar(serie, pontos);
      await o.armazem.registrarVerificacao(serie, new Date(o.agora()), null);
      return { serie, novos, erro: null };
    } catch (e) {
      const erro = e instanceof Error ? e.message : "falha desconhecida";
      o.log.warn({ serie, erro }, "não foi possível atualizar a série do Banco Central");
      await o.armazem.registrarVerificacao(serie, new Date(o.agora()), erro).catch(() => undefined);
      return { serie, novos: 0, erro };
    }
  }

  async function executar(): Promise<ResultadoAtualizacao[]> {
    const estado = new Map((await o.armazem.estado()).map((e) => [e.serie, e.ultimoDia]));
    const resultados: ResultadoAtualizacao[] = [];
    for (const serie of SERIES_INDICADOR)
      resultados.push(await atualizarSerie(serie, estado.get(serie) ?? null));
    return resultados;
  }

  const atualizar = (): Promise<ResultadoAtualizacao[]> => {
    emAndamento ??= executar().finally(() => {
      emAndamento = null;
    });
    return emAndamento;
  };

  return {
    atualizar,
    agendar(intervaloMs = INTERVALO_ATUALIZACAO_MS) {
      const rodar = (): void => {
        atualizar().catch((e: unknown) =>
          o.log.warn({ err: e }, "atualização dos índices do Banco Central falhou"),
        );
      };
      rodar();
      const relogio = setInterval(rodar, intervaloMs);
      relogio.unref();
      return () => clearInterval(relogio);
    },
  };
}
