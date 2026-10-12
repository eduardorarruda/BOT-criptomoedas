import type {
  CompraExecutada,
  EstadoDecisao,
  EstadoProtecaoGravada,
  Evento,
  NovaDecisao,
  NovaOrdem,
  NovaProtecao,
  OrdemPendente,
  PortaAprovacao,
  PortaDecisoes,
  PortaEventos,
  PortaOrdens,
  PortaProtecoes,
  PortaRobos,
  ProtecaoGravada,
  Relogio,
  ResultadoOrdem,
  RoboConfig,
  SaidaProtecao,
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

  constructor(private robos: readonly RoboConfig[]) {}

  ativos(): Promise<RoboConfig[]> {
    return Promise.resolve([...this.robos]);
  }

  /** Troca a lista (o motor relê na próxima recarga). */
  definir(robos: readonly RoboConfig[]): void {
    this.robos = [...robos];
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
  readonly desfecho?: { readonly resultado: Valor; readonly em: number };
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

  registrarDesfecho(id: string, resultado: Valor, em: number): Promise<void> {
    const atual = this.decisoes.get(id);
    if (!atual) return Promise.reject(new Error(`A decisão ${id} não existe; o desfecho não foi gravado.`));
    this.decisoes.set(id, { ...atual, desfecho: { resultado, em } });
    return Promise.resolve();
  }

  /** A mais recente pelo instante; no empate, a registrada por último. */
  ultimaCompraExecutada(roboId: string): Promise<CompraExecutada | null> {
    const compras = this.todas().filter(
      (d) => d.roboId === roboId && d.estado === "executada" && d.sinal.acao === "COMPRAR",
    );
    const ultima = compras.reduce<DecisaoGuardada | null>((m, d) => (!m || d.em >= m.em ? d : m), null);
    if (!ultima) return Promise.resolve(null);
    return Promise.resolve({
      decisaoId: ultima.id,
      preco: ultima.preco,
      ...(ultima.protecao ? { protecao: ultima.protecao } : {}),
    });
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

  pendentes(roboId: string): Promise<OrdemPendente[]> {
    const pendentes = this.doRobo(roboId)
      .filter((o) => (o.resultado?.estado ?? "PENDENTE") === "PENDENTE")
      .map((o) => ({
        idCliente: o.ordem.idCliente,
        decisaoId: o.ordem.decisaoId,
        lado: o.ordem.lado,
        quantidade: o.ordem.quantidade,
        criadaEm: o.criadaEm,
      }));
    return Promise.resolve(pendentes);
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

const VIVAS: readonly EstadoProtecaoGravada[] = ["PENDENTE", "ATIVA"];

/**
 * Proteções na corretora em memória, com a mesma semântica da porta do banco: uma viva
 * por robô, e a venda de uma perna vira decisão + ordem + execuções nas memórias de
 * decisões e ordens (a posição sai das execuções), uma vez só.
 */
export class ProtecoesMemoria implements PortaProtecoes {
  private protecoes: readonly ProtecaoGravada[] = [];

  constructor(
    private readonly decisoes: PortaDecisoes,
    private readonly ordens: OrdensMemoria,
    private readonly relogio: Relogio,
  ) {}

  reservar(p: NovaProtecao): Promise<"nova" | "ja_existe"> {
    const repetida = this.protecoes.some(
      (x) => x.ids.lista === p.ids.lista || (x.roboId === p.roboId && VIVAS.includes(x.estado)),
    );
    if (repetida) return Promise.resolve("ja_existe");
    const agora = this.relogio.agora();
    const nova: ProtecaoGravada = {
      ...p,
      estado: "PENDENTE",
      idCorretora: null,
      criadaEm: agora,
      atualizadaEm: agora,
    };
    this.protecoes = [...this.protecoes, nova];
    return Promise.resolve("nova");
  }

  viva(roboId: string): Promise<ProtecaoGravada | null> {
    return Promise.resolve(this.doRobo(roboId).find((p) => VIVAS.includes(p.estado)) ?? null);
  }

  ultima(roboId: string): Promise<ProtecaoGravada | null> {
    return Promise.resolve(this.doRobo(roboId).at(-1) ?? null);
  }

  atualizar(
    idLista: string,
    estado: EstadoProtecaoGravada,
    extra: { readonly idCorretora?: string | null; readonly motivo?: string } = {},
  ): Promise<void> {
    if (!this.protecoes.some((p) => p.ids.lista === idLista))
      return Promise.reject(new Error(`A proteção ${idLista} não existe; não dá para mudar o estado dela.`));
    this.protecoes = this.protecoes.map((p) =>
      p.ids.lista !== idLista
        ? p
        : {
            ...p,
            estado,
            ...(extra.idCorretora !== undefined ? { idCorretora: extra.idCorretora } : {}),
            ...(extra.motivo !== undefined ? { motivo: extra.motivo } : {}),
            atualizadaEm: this.relogio.agora(),
          },
    );
    return Promise.resolve();
  }

  async registrarSaida(idLista: string, s: SaidaProtecao): Promise<{ decisaoId: string; nova: boolean }> {
    const p = this.protecoes.find((x) => x.ids.lista === idLista);
    if (!p) throw new Error(`A proteção ${idLista} não existe; a venda não foi gravada.`);
    const existente = this.ordens.todas().find((o) => o.ordem.idCliente === s.ordem.idCliente);
    const decisaoId =
      existente?.ordem.decisaoId ?? (await this.decisoes.registrar({ ...s.decisao, roboId: p.roboId }));
    if (!existente)
      await this.ordens.reservar({
        decisaoId,
        roboId: p.roboId,
        idCliente: s.ordem.idCliente,
        simbolo: p.simbolo,
        lado: "VENDA",
        quantidade: s.quantidade,
      });
    await this.ordens.concluir(s.ordem.idCliente, s.ordem);
    return { decisaoId, nova: !existente };
  }

  todas(): readonly ProtecaoGravada[] {
    return this.protecoes;
  }

  private doRobo(roboId: string): ProtecaoGravada[] {
    return this.protecoes.filter((p) => p.roboId === roboId);
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
