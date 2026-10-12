import type { AlertaEmitido, AvisoDTO, TipoAlerta } from "@zentrade/contratos";
import type { NovoAviso } from "@zentrade/banco";
import type { AntiReplay } from "./anti-replay.js";
import type { ClienteN8n } from "./n8n.js";
import type { Log } from "./tipos.js";

const HORA_S = 3600;
const DIA_S = 24 * HORA_S;

/**
 * Por quanto tempo o mesmo fato (a mesma `chave`) não vira outro aviso. As chaves que
 * já carregam o período (dia, mês, id da ordem) usam a janela só como teto.
 */
export const JANELA_DEDUP_S: Readonly<Record<TipoAlerta, number>> = {
  stop_atingido: DIA_S,
  perda_diaria_robo: DIA_S,
  perda_diaria_conta: DIA_S,
  pausa_sequencia_stops: 6 * HORA_S,
  pausa_queda: 6 * HORA_S,
  ordem_rejeitada: DIA_S,
  ordem_incerta: DIA_S,
  robo_nao_ligou: 6 * HORA_S,
  websocket_fora: DIA_S,
  divergencia_saldo: 7 * DIA_S,
  orcamento_ia_80: 32 * DIA_S,
  orcamento_ia_100: 32 * DIA_S,
};

/** Teto de mensagens ao Telegram por pessoa; o que passar fica só na tela (os críticos sempre vão). */
export const ENVIOS_PADRAO = { maximo: 10, janelaMs: 15 * 60_000 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoEmissao = "novo" | "repetido" | "sem_dona";

export interface CentralAlertas {
  emitir(alerta: AlertaEmitido): Promise<ResultadoEmissao>;
}

export interface DependenciasAlertas {
  readonly avisos: {
    gravar(usuarioId: string, a: NovoAviso): Promise<AvisoDTO>;
    marcarEnviado(usuarioId: string, id: string): Promise<void>;
    enviadosDesde(usuarioId: string, desde: number): Promise<number>;
  };
  readonly n8n: Pick<ClienteN8n, "enviarAlerta">;
  /** SET NX com prazo (Redis em produção): atômico entre processos. */
  readonly dedup: AntiReplay;
  readonly donoDoRobo: (roboId: string) => Promise<string | null>;
  readonly log: Log & { info?(obj: object, msg?: string): void };
  readonly agora: () => number;
  readonly envios?: { readonly maximo: number; readonly janelaMs: number };
}

/**
 * A central de alertas: acha a dona, deduplica, grava o aviso da tela e repassa ao n8n
 * (Telegram). Falha no n8n não perde o aviso: ele fica na tela, marcado como não enviado.
 */
export function criarCentralAlertas(d: DependenciasAlertas): CentralAlertas {
  const envios = d.envios ?? ENVIOS_PADRAO;

  async function donaDe(a: AlertaEmitido): Promise<string | null> {
    if (a.usuarioId) return a.usuarioId;
    return a.roboId ? d.donoDoRobo(a.roboId) : null;
  }

  async function podeEnviar(usuarioId: string, a: AlertaEmitido): Promise<boolean> {
    if (a.gravidade === "critico") return true;
    return (await d.avisos.enviadosDesde(usuarioId, d.agora() - envios.janelaMs)) < envios.maximo;
  }

  async function enviar(usuarioId: string, aviso: AvisoDTO, a: AlertaEmitido): Promise<void> {
    if (!(await podeEnviar(usuarioId, a))) {
      d.log.warn({ usuarioId, tipo: a.tipo }, "teto de alertas por pessoa: este fica só na tela");
      return;
    }
    try {
      await d.n8n.enviarAlerta({
        tipo: a.tipo,
        titulo: a.titulo,
        mensagem: a.mensagem,
        em: a.em,
        gravidade: a.gravidade,
        chave: a.chave,
      });
      await d.avisos.marcarEnviado(usuarioId, aviso.id);
    } catch (erro) {
      d.log.error({ err: erro, tipo: a.tipo }, "alerta não chegou ao n8n: fica só na tela");
    }
  }

  return {
    async emitir(a) {
      const usuarioId = await donaDe(a);
      if (!usuarioId || !UUID.test(usuarioId)) {
        d.log.warn({ tipo: a.tipo, roboId: a.roboId }, "alerta sem dona conhecida: descartado");
        return "sem_dona";
      }
      if (!(await d.dedup.primeiraVez(`${usuarioId}:${a.chave}`, JANELA_DEDUP_S[a.tipo]))) return "repetido";
      const aviso = await d.avisos.gravar(usuarioId, {
        tipo: a.tipo,
        gravidade: a.gravidade,
        titulo: a.titulo,
        mensagem: a.mensagem,
        chave: a.chave,
        // Criado agora (o teto por pessoa conta por aqui), mesmo que o fato seja de antes.
        em: d.agora(),
        ...(a.roboId && UUID.test(a.roboId) ? { roboId: a.roboId } : {}),
      });
      await enviar(usuarioId, aviso, a);
      return "novo";
    },
  };
}
