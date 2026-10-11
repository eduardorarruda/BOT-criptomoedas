import type {
  EstadoDecisao,
  Evento,
  NovaDecisao,
  NovaOrdem,
  PortaAprovacao,
  PortaDecisoes,
  PortaEventos,
  PortaOrdens,
  PortaRobos,
  Relogio,
  ResultadoOrdem,
  RoboConfig,
} from "@zentrade/contratos";
import type { Execucao, Valor } from "@zentrade/dominio";
import { randomUUID } from "node:crypto";
import { resultadoDesde, ultimaPerdaEm } from "../historico.js";

/**
 * Portas em memória: para testes e para rodar em papel sem banco. Mesma semântica
 * que as do banco (packages/banco): a posição sai das execuções, a reserva da
 * ordem é idempotente pelo idCliente.
 */
export class RobosMemoria implements PortaRobos {
  private pausadosIds: ReadonlySet<string> = new Set();
  private paradaGlobal = false;

  constructor(private readonly robos: readonly RoboConfig[]) {}

  ativos(): Promise<RoboConfig[]> {
    return Promise.resolve([...this.robos]);
  }

  pausado(roboId: string): Promise<boolean> {
    return Promise.resolve(this.paradaGlobal || this.pausadosIds.has(roboId));
  }

  /** Sem id: parada total de todos os robôs. */
  pausar(roboId?: string): void {
    if (roboId === undefined) this.paradaGlobal = true;
    else this.pausadosIds = new Set([...this.pausadosIds, roboId]);
  }

  retomar(roboId?: string): void {
    if (roboId === undefined) this.paradaGlobal = false;
    else this.pausadosIds = new Set([...this.pausadosIds].filter((id) => id !== roboId));
  }
}

export interface DecisaoGuardada extends NovaDecisao {
  readonly id: string;
}

export class DecisoesMemoria implements PortaDecisoes {
  private readonly decisoes = new Map<string, DecisaoGuardada>();

  registrar(decisao: NovaDecisao): Promise<string> {
    const id = randomUUID();
    this.decisoes.set(id, { ...decisao, id });
    return Promise.resolve(id);
  }

  mudarEstado(id: string, estado: EstadoDecisao): Promise<void> {
    const atual = this.decisoes.get(id);
    if (!atual)
      return Promise.reject(new Error(`A decisão ${id} não existe; não dá para mudar o estado dela.`));
    this.decisoes.set(id, { ...atual, estado });
    return Promise.resolve();
  }

  estado(id: string): Promise<EstadoDecisao | null> {
    return Promise.resolve(this.decisoes.get(id)?.estado ?? null);
  }

  todas(): DecisaoGuardada[] {
    return [...this.decisoes.values()];
  }
}

export interface OrdemGuardada {
  readonly ordem: NovaOrdem;
  readonly criadaEm: number;
  readonly resultado?: ResultadoOrdem;
}

export class OrdensMemoria implements PortaOrdens {
  private readonly ordens = new Map<string, OrdemGuardada>();

  constructor(private readonly relogio: Relogio) {}

  reservar(ordem: NovaOrdem): Promise<"nova" | "ja_existe"> {
    if (this.ordens.has(ordem.idCliente)) return Promise.resolve("ja_existe");
    this.ordens.set(ordem.idCliente, { ordem, criadaEm: this.relogio.agora() });
    return Promise.resolve("nova");
  }

  concluir(idCliente: string, resultado: ResultadoOrdem): Promise<void> {
    const atual = this.ordens.get(idCliente);
    if (!atual)
      return Promise.reject(
        new Error(`A ordem ${idCliente} não foi reservada antes do envio; isso é um defeito do motor.`),
      );
    this.ordens.set(idCliente, { ...atual, resultado });
    return Promise.resolve();
  }

  execucoes(roboId: string): Promise<Execucao[]> {
    return Promise.resolve(this.execucoesDe(roboId));
  }

  contarDesde(roboId: string, desdeMs: number): Promise<number> {
    return Promise.resolve(this.doRobo(roboId).filter((o) => o.criadaEm >= desdeMs).length);
  }

  resultadoDesde(roboId: string, desdeMs: number): Promise<Valor> {
    return Promise.resolve(resultadoDesde(this.execucoesDe(roboId), desdeMs));
  }

  ultimaPerdaEm(roboId: string): Promise<number | null> {
    return Promise.resolve(ultimaPerdaEm(this.execucoesDe(roboId)));
  }

  todas(): OrdemGuardada[] {
    return [...this.ordens.values()];
  }

  private doRobo(roboId: string): OrdemGuardada[] {
    return [...this.ordens.values()].filter((o) => o.ordem.roboId === roboId);
  }

  private execucoesDe(roboId: string): Execucao[] {
    return this.doRobo(roboId)
      .flatMap((o) => o.resultado?.execucoes ?? [])
      .sort((a, b) => a.em - b.em);
  }
}

export class EventosMemoria implements PortaEventos {
  private readonly eventos: Evento[] = [];

  publicar(evento: Evento): Promise<void> {
    this.eventos.push(evento);
    return Promise.resolve();
  }

  todos(): readonly Evento[] {
    return this.eventos;
  }

  doTipo<T extends Evento["tipo"]>(tipo: T): Extract<Evento, { tipo: T }>[] {
    return this.eventos.filter((e): e is Extract<Evento, { tipo: T }> => e.tipo === tipo);
  }
}

export interface Solicitacao {
  readonly decisaoId: string;
  readonly resumo: string;
  readonly expiraEm: number;
}

/** Guarda os pedidos de aprovação; `aoSolicitar` deixa o teste fazer o papel da pessoa. */
export class AprovacaoMemoria implements PortaAprovacao {
  private readonly pedidos: Solicitacao[] = [];

  constructor(private readonly aoSolicitar?: (decisaoId: string) => void) {}

  solicitar(decisaoId: string, resumo: string, expiraEm: number): Promise<void> {
    this.pedidos.push({ decisaoId, resumo, expiraEm });
    this.aoSolicitar?.(decisaoId);
    return Promise.resolve();
  }

  solicitacoes(): readonly Solicitacao[] {
    return this.pedidos;
  }
}
