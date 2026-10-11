import { AutomacaoEsquema, type Automacao } from "@zentrade/contratos";
import { z } from "zod";
import type { Log } from "./tipos.js";

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const MAXIMO_FALHAS_GUARDADAS = 100;
/** Fluxo agendado que ficou mais que isto × o intervalo sem sinal aparece como desligado. */
const TOLERANCIA_ATRASO = 3;

/**
 * Os fluxos de infra/n8n que a API consegue observar: os que chamam um webhook
 * assinado dela, ou que recebem um aviso enviado por ela. Relatório diário e
 * revalidação semanal usam a API REST com token e não aparecem aqui.
 */
export const FLUXOS = [
  {
    id: "zentrade-vigia-saude",
    nome: "Vigia de saúde",
    descricao: "Confere a cada minuto se o motor está vivo; se parar, liga a parada total e avisa.",
    aCadaMs: MINUTO,
  },
  {
    id: "zentrade-noticias",
    nome: "Notícias para o conhecimento",
    descricao: "Lê anúncios da Binance e feeds de notícias e guarda no conhecimento do agente.",
    aCadaMs: 15 * MINUTO,
  },
  {
    id: "zentrade-aprovacao",
    nome: "Aprovação pelo Telegram",
    descricao: "Manda cada sugestão para o seu Telegram com botões de aprovar e recusar.",
    aCadaMs: null,
  },
  {
    id: "zentrade-alertas",
    nome: "Alertas",
    descricao: "Avisa no Telegram quando a parada total muda ou algo importante acontece.",
    aCadaMs: null,
  },
] as const satisfies readonly { id: string; nome: string; descricao: string; aCadaMs: number | null }[];

export type IdFluxo = (typeof FLUXOS)[number]["id"];

const SinalEsquema = z.object({
  ultimaEm: z.number().int(),
  ok: z.boolean(),
  falhas: z.array(z.number().int()).max(MAXIMO_FALHAS_GUARDADAS),
});
export type SinalFluxo = z.infer<typeof SinalEsquema>;

/** Onde os sinais ficam guardados (Redis em produção; memória nos testes). */
export interface ArmazemSinais {
  ler(): Promise<Record<string, string>>;
  gravar(id: IdFluxo, valor: string): Promise<void>;
}

export interface RegistroAutomacoes {
  /** Nunca lança: falha ao registrar fica no log e não derruba quem chamou. */
  registrar(id: IdFluxo, ok: boolean): Promise<void>;
  listar(): Promise<Automacao[]>;
}

export const CHAVE_AUTOMACOES = "zentrade:automacoes";

/** Hash do Redis com um campo por fluxo. */
export function armazemRedis(redis: {
  hgetall(chave: string): Promise<Record<string, string>>;
  hset(chave: string, campo: string, valor: string): Promise<number>;
}): ArmazemSinais {
  return {
    ler: () => redis.hgetall(CHAVE_AUTOMACOES),
    gravar: async (id, valor) => void (await redis.hset(CHAVE_AUTOMACOES, id, valor)),
  };
}

export function armazemMemoria(): ArmazemSinais {
  const dados: Record<string, string> = {};
  return {
    ler: async () => ({ ...dados }),
    gravar: async (id, valor) => void (dados[id] = valor),
  };
}

function lerSinal(texto: string | undefined): SinalFluxo | null {
  if (texto === undefined) return null;
  try {
    const lido = SinalEsquema.safeParse(JSON.parse(texto));
    return lido.success ? lido.data : null;
  } catch {
    return null;
  }
}

function paraAutomacao(fluxo: (typeof FLUXOS)[number], s: SinalFluxo, agora: number): Automacao {
  return AutomacaoEsquema.parse({
    id: fluxo.id,
    nome: fluxo.nome,
    descricao: fluxo.descricao,
    ativa: fluxo.aCadaMs === null || agora - s.ultimaEm <= TOLERANCIA_ATRASO * fluxo.aCadaMs,
    ultimaExecucaoEm: s.ultimaEm,
    ultimoResultado: s.ok ? "ok" : "falhou",
    falhas24h: s.falhas.filter((t) => agora - t <= DIA).length,
  });
}

/**
 * Status dos fluxos do n8n derivado do que a API viu (ela não consulta o n8n).
 * Fluxo que nunca deu sinal fica fora da lista: lista vazia = nenhum sinal ainda.
 */
export function criarRegistroAutomacoes(o: {
  readonly armazem: ArmazemSinais;
  readonly agora: () => number;
  readonly log: Log;
}): RegistroAutomacoes {
  return {
    async registrar(id, ok) {
      try {
        const agora = o.agora();
        const anterior = lerSinal((await o.armazem.ler())[id]);
        const falhas = [...(anterior?.falhas ?? []).filter((t) => agora - t <= DIA), ...(ok ? [] : [agora])];
        const sinal: SinalFluxo = { ultimaEm: agora, ok, falhas: falhas.slice(-MAXIMO_FALHAS_GUARDADAS) };
        await o.armazem.gravar(id, JSON.stringify(sinal));
      } catch (erro) {
        o.log.warn({ err: erro, fluxo: id }, "não foi possível registrar o sinal do fluxo do n8n");
      }
    },
    async listar() {
      const guardados = await o.armazem.ler();
      const agora = o.agora();
      return FLUXOS.flatMap((fluxo) => {
        const sinal = lerSinal(guardados[fluxo.id]);
        return sinal ? [paraAutomacao(fluxo, sinal, agora)] : [];
      });
    },
  };
}
