import { EventoEsquema, Instante, type Evento } from "@zentrade/contratos";
import { z } from "zod";
import type { Log } from "./tipos.js";

/**
 * Histórico curto do que cada robô fez, para a tela "Ao vivo" abrir já preenchida em
 * vez de vazia esperando o próximo evento. Uma lista por robô no Redis, com teto e
 * validade: é memória de curto prazo, não fonte da verdade (essa é o banco).
 */
export const CHAVE_HISTORICO = "zentrade:aovivo:robo:";
const CHAVE_DECISAO = "zentrade:aovivo:decisao:";
export const TETO_PADRAO = 400;
export const VALIDADE_PADRAO_S = 24 * 3600;

export const RegistroAoVivoEsquema = z.object({ recebidoEm: Instante, evento: EventoEsquema });
export type RegistroAoVivo = z.infer<typeof RegistroAoVivoEsquema>;

/** O pedaço de armazenamento que o histórico usa (Redis em produção, memória no teste). */
export interface ArmazemHistorico {
  /** Põe no início da lista, corta no teto e renova a validade. */
  empilhar(chave: string, texto: string, teto: number, validadeS: number): Promise<void>;
  /** Os `limite` mais novos, do mais novo ao mais antigo. */
  ler(chave: string, limite: number): Promise<string[]>;
  definir(chave: string, valor: string, validadeS: number): Promise<void>;
  obter(chave: string): Promise<string | null>;
}

export interface HistoricoEventos {
  /** Ouvinte do hub: nunca lança (falha vai para o log). */
  guardar(evento: Evento): Promise<void>;
  /** Do mais antigo ao mais novo. */
  recentes(roboId: string, limite?: number): Promise<RegistroAoVivo[]>;
}

/**
 * O robô do evento; `null` = não é de robô (preço, saúde, configuração do robô);
 * `undefined` = ordem, que só diz a decisão (o robô é descoberto por ela).
 */
export function roboDoEvento(e: Evento): string | null | undefined {
  switch (e.tipo) {
    case "analise":
    case "candle":
    case "sinal":
    case "posicao":
    case "risco":
      return e.roboId;
    case "decisao":
      return e.decisao.roboId;
    case "ordem":
      return undefined;
    default:
      return null;
  }
}

interface OpcoesHistorico {
  readonly armazem: ArmazemHistorico;
  readonly agora: () => number;
  readonly log: Log;
  /** Para ordens de decisões que o histórico não viu (ex.: a API reiniciou). */
  readonly roboDaDecisao: (decisaoId: string) => Promise<string | null>;
  readonly teto?: number;
  readonly validadeS?: number;
}

export function criarHistoricoEventos(o: OpcoesHistorico): HistoricoEventos {
  const teto = o.teto ?? TETO_PADRAO;
  const validade = o.validadeS ?? VALIDADE_PADRAO_S;

  async function roboDe(e: Evento): Promise<string | null> {
    const direto = roboDoEvento(e);
    if (direto !== undefined || e.tipo !== "ordem") return direto ?? null;
    const lembrado = await o.armazem.obter(CHAVE_DECISAO + e.ordem.decisaoId);
    return lembrado ?? (await o.roboDaDecisao(e.ordem.decisaoId));
  }

  async function gravar(evento: Evento, recebidoEm: number): Promise<void> {
    try {
      const roboId = await roboDe(evento);
      if (!roboId) return;
      if (evento.tipo === "decisao")
        await o.armazem.definir(CHAVE_DECISAO + evento.decisao.id, roboId, validade);
      const registro: RegistroAoVivo = { recebidoEm, evento };
      await o.armazem.empilhar(CHAVE_HISTORICO + roboId, JSON.stringify(registro), teto, validade);
    } catch (erro) {
      o.log.warn({ err: erro, tipo: evento.tipo }, "evento fora do histórico ao vivo (armazém indisponível)");
    }
  }

  // Uma gravação por vez, na ordem de chegada: a ordem que precisa perguntar ao banco
  // de que robô é não pode passar na frente da decisão que chegou depois dela.
  let fila: Promise<void> = Promise.resolve();
  function guardar(evento: Evento): Promise<void> {
    const recebidoEm = o.agora();
    fila = fila.then(() => gravar(evento, recebidoEm));
    return fila;
  }

  function interpretar(texto: string): RegistroAoVivo | null {
    try {
      const lido = RegistroAoVivoEsquema.safeParse(JSON.parse(texto));
      if (lido.success) return lido.data;
    } catch {
      // cai no aviso abaixo
    }
    o.log.warn({ tamanho: texto.length }, "linha inválida no histórico ao vivo: pulada");
    return null;
  }

  async function recentes(roboId: string, limite = teto): Promise<RegistroAoVivo[]> {
    const linhas = await o.armazem.ler(CHAVE_HISTORICO + roboId, Math.min(limite, teto));
    return linhas
      .map(interpretar)
      .filter((r): r is RegistroAoVivo => r !== null)
      .reverse();
  }

  return { guardar, recentes };
}

/** Em memória, sem validade: para testes e desenvolvimento sem Redis. */
export function armazemHistoricoMemoria(): ArmazemHistorico {
  let listas = new Map<string, readonly string[]>();
  let valores = new Map<string, string>();
  return {
    empilhar(chave, texto, teto) {
      listas = new Map(listas).set(chave, [texto, ...(listas.get(chave) ?? [])].slice(0, teto));
      return Promise.resolve();
    },
    ler: (chave, limite) => Promise.resolve((listas.get(chave) ?? []).slice(0, limite)),
    definir(chave, valor) {
      valores = new Map(valores).set(chave, valor);
      return Promise.resolve();
    },
    obter: (chave) => Promise.resolve(valores.get(chave) ?? null),
  };
}

/** O pedaço do ioredis que o armazém usa (facilita o teste sem Redis). */
export interface RedisHistorico {
  multi(): {
    lpush(chave: string, texto: string): unknown;
    ltrim(chave: string, inicio: number, fim: number): unknown;
    expire(chave: string, segundos: number): unknown;
    exec(): Promise<[Error | null, unknown][] | null>;
  };
  lrange(chave: string, inicio: number, fim: number): Promise<string[]>;
  set(chave: string, valor: string, modo: "EX", segundos: number): Promise<unknown>;
  get(chave: string): Promise<string | null>;
}

export function armazemHistoricoRedis(redis: RedisHistorico): ArmazemHistorico {
  return {
    async empilhar(chave, texto, teto, validadeS) {
      const m = redis.multi();
      m.lpush(chave, texto);
      m.ltrim(chave, 0, teto - 1);
      m.expire(chave, validadeS);
      const falha = (await m.exec())?.find(([erro]) => erro !== null)?.[0];
      if (falha) throw falha;
    },
    ler: (chave, limite) => redis.lrange(chave, 0, limite - 1),
    async definir(chave, valor, validadeS) {
      await redis.set(chave, valor, "EX", validadeS);
    },
    obter: (chave) => redis.get(chave),
  };
}
