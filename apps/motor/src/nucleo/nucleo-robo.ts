import type { ResultadoOrdem, RoboConfig } from "@zentrade/contratos";
import { decidir, paraTexto, posicaoDe, type Candle, type Posicao, type Valor } from "@zentrade/dominio";
import { BufferCandles } from "../buffer.js";
import { Trava } from "../trava.js";
import {
  barrarPorPosicaoZerada,
  concluirAprovacao,
  vigiarAprovacao,
  type FimAprovacao,
} from "./aprovacao.js";
import { publicarCandle, publicarPosicao, publicarSinal } from "./aovivo.js";
import { MemoriaBloqueio } from "./bloqueio.js";
import { ehProtecao, processarSinal } from "./ciclo.js";
import { mudarEstado, publicar } from "./diario.js";
import type { Plano } from "./plano.js";
import { PosicaoAberta } from "./posicao-aberta.js";
import { conferirOrdemIncerta, type OrdemIncerta } from "./reconciliacao.js";
import { conferirProtecao, StopNaCorretora } from "./stop-corretora.js";
import type { AprovacaoPendente, Dependencias, EntradaCiclo, ResultadoCiclo } from "./tipos.js";

type Contexto = Omit<EntradaCiclo, "fechamentos">;

/**
 * O robô sem rede: recebe candles fechados e decide. É o mesmo código ao vivo e no
 * backtest. Uma trava garante uma decisão por vez; o buffer recusa candle repetido.
 * A espera pela aprovação (modo sugerir) roda fora da trava: o stop segue vigiado.
 */
export class NucleoRobo {
  private readonly buffer: BufferCandles;
  private readonly trava = new Trava();
  private readonly aberta: PosicaoAberta;
  private readonly bloqueio: MemoriaBloqueio;
  private readonly stopNaCorretora: StopNaCorretora;
  private ultimoMinuto = 0;
  private falhas = 0;
  private incertas: readonly OrdemIncerta[] = [];
  private aprovacao: AprovacaoPendente | null = null;
  private vigia: Promise<void> = Promise.resolve();
  private parando = false;

  constructor(
    readonly robo: RoboConfig,
    private readonly deps: Dependencias,
  ) {
    this.buffer = new BufferCandles(deps.opcoes.tamanhoHistorico);
    this.aberta = new PosicaoAberta(robo, deps);
    this.bloqueio = new MemoriaBloqueio(() => deps.robos.pausado(robo.id));
    this.stopNaCorretora = new StopNaCorretora(robo, deps, (p) => this.aberta.protecaoEfetiva(p));
  }

  get totalFalhas(): number {
    return this.falhas;
  }

  historico(): Candle[] {
    return this.buffer.lista();
  }

  /** Antes de ligar: ordens PENDENTE das portas (o processo pode ter caído no meio de um envio). */
  async restaurar(): Promise<void> {
    this.incertas = await this.deps.ordens.pendentes(this.robo.id);
    if (this.incertas.length > 0)
      this.deps.registro.warn(
        { roboId: this.robo.id, pendentes: this.incertas.map((o) => o.idCliente) },
        "ordens pendentes de antes do reinício: conferindo na corretora antes de decidir",
      );
  }

  /**
   * Na partida: confere contra o banco a proteção que estava no livro da corretora (pode
   * ter executado com o motor fora do ar) e deixa no livro a proteção certa para a posição.
   */
  async reconciliarProtecao(preco: Valor | null): Promise<void> {
    await this.protegido("reconciliar a proteção na corretora", async () => {
      await this.acompanharCorretora(preco);
    });
  }

  /** Backfill (início ou volta da conexão): completa a história sem decidir sobre candles velhos. */
  async completarHistorico(candles: readonly Candle[]): Promise<void> {
    await this.protegido("completar o histórico", async () => {
      const novos = candles.filter((c) => this.buffer.adicionar(c)).length;
      if (novos > 0) this.deps.registro.info({ roboId: this.robo.id, novos }, "histórico completado");
    });
  }

  /** Candle fechado do intervalo do robô: decisão completa (entrada, saída, stop, alvo). */
  aoFecharIntervalo(candle: Candle): Promise<ResultadoCiclo | null> {
    return this.protegido("decidir no candle do intervalo", async () => {
      if (!this.buffer.adicionar(candle)) return null;
      await publicarCandle(this.deps, this.robo, candle);
      await this.publicarPreco(candle);
      await this.conferirCorretora();
      const r = await this.decidirNoIntervalo(candle);
      await this.ajustarCorretora(candle.fecha);
      return r;
    });
  }

  private async decidirNoIntervalo(candle: Candle): Promise<ResultadoCiclo | null> {
    if (!(await this.semOrdemIncerta())) return null;
    this.bloqueio.novoIntervalo();
    const posicao = await this.posicao();
    const sinal = decidir(
      await this.aberta.estrategia(posicao),
      { ...this.buffer.contexto(), preco: candle.fecha },
      posicao,
    );
    await publicarSinal(this.deps, this.robo, sinal, candle.fecha, candle.fechamento);
    return this.seguir({ sinal, preco: candle.fecha, posicao, em: candle.fechamento });
  }

  /** Candle de 1 minuto: só vigia stop e alvo da posição aberta, entre um candle do intervalo e outro. */
  aoFecharMinuto(candle: Candle): Promise<ResultadoCiclo | null> {
    return this.protegido("vigiar stop e alvo", async () => {
      if (candle.abertura <= this.ultimoMinuto) return null;
      this.ultimoMinuto = candle.abertura;
      await this.publicarPreco(candle);
      await this.conferirCorretora();
      const r = await this.vigiarNoMinuto(candle);
      await this.ajustarCorretora(candle.fecha);
      return r;
    });
  }

  /** A segunda linha de defesa: stop e alvo no fechamento do minuto, mesmo com a proteção no livro. */
  private async vigiarNoMinuto(candle: Candle): Promise<ResultadoCiclo | null> {
    if (!(await this.semOrdemIncerta())) return null;
    const posicao = await this.posicao();
    if (posicao.quantidade.isZero()) return null;
    const { saida: _ignorada, ...soStopEAlvo } = await this.aberta.estrategia(posicao);
    const sinal = decidir(soStopEAlvo, { ...this.buffer.contexto(), preco: candle.fecha }, posicao);
    if (sinal.acao !== "VENDER" || (await this.bloqueio.repetido(sinal, posicao))) return null;
    await publicarSinal(this.deps, this.robo, sinal, candle.fecha, candle.fechamento);
    return this.seguir({ sinal, preco: candle.fecha, posicao, em: candle.fechamento });
  }

  /** Resolve quando não há decisão nem espera de aprovação em andamento. */
  async ocioso(): Promise<void> {
    for (;;) {
      const vigia = this.vigia;
      await vigia;
      await this.trava.ocioso();
      if (vigia === this.vigia) return;
    }
  }

  /** Só a decisão em andamento (a espera por aprovação pode continuar). */
  semDecisaoEmAndamento(): Promise<void> {
    return this.trava.ocioso();
  }

  /** Para de esperar aprovação: a decisão pendente expira, porque ninguém mais vai executá-la. */
  async parar(): Promise<void> {
    this.parando = true;
    await this.vigia;
    await this.protegido("encerrar a aprovação pendente", async () => {
      const p = this.aprovacao;
      if (!p) return;
      this.aprovacao = null;
      await mudarEstado(this.deps, p.registrada, "expirada");
      this.deps.registro.warn(
        { roboId: this.robo.id, decisaoId: p.registrada.id },
        "robô parou: aprovação pendente expirada",
      );
    });
  }

  private async seguir(e: Contexto): Promise<ResultadoCiclo | null> {
    // Com uma aprovação pendente, só a proteção (stop e alvo) passa: o resto espera a pessoa.
    if (this.aprovacao && !ehProtecao(e.sinal)) return null;
    const r = await processarSinal(this.deps, this.robo, { ...e, fechamentos: this.buffer.fechamentos() });
    await this.bloqueio.registrar(e.sinal, r, e.posicao);
    if (r.pendente) this.esperarAprovacao(r.pendente);
    if (r.ordem && r.plano && r.decisaoId) await this.aposOrdem(r.ordem, r.plano, r.decisaoId);
    return r;
  }

  private async aposOrdem(ordem: ResultadoOrdem, plano: Plano, decisaoId: string): Promise<void> {
    if (ordem.estado === "PENDENTE" && ordem.execucoes.length === 0) {
      const incerta = {
        idCliente: ordem.idCliente,
        decisaoId,
        lado: plano.lado,
        quantidade: plano.quantidade,
      };
      this.incertas = [...this.incertas, { ...incerta, criadaEm: this.deps.relogio.agora() }];
      return;
    }
    if (ordem.execucoes.length === 0) return;
    if (plano.lado === "COMPRA") this.aberta.aoComprar(decisaoId, plano.ajuste);
    else await this.aposVenda();
    await publicarPosicao(this.deps, this.robo);
  }

  /** Venda executada: grava o desfecho e, se a posição zerou, encerra a venda que esperava aprovação. */
  private async aposVenda(): Promise<void> {
    if (!(await this.aberta.aoVender())) return;
    const p = this.aprovacao;
    if (p?.plano.lado !== "VENDA") return;
    this.aprovacao = null;
    await barrarPorPosicaoZerada(this.deps, p);
  }

  private esperarAprovacao(p: AprovacaoPendente): void {
    this.aprovacao = p;
    const ativa = () => !this.parando && this.aprovacao === p;
    this.vigia = vigiarAprovacao(this.deps, p.registrada.id, p.expiraEm, ativa)
      .then((fim) => (fim && ativa() ? this.aoResponder(p, fim) : undefined))
      .catch((erro: unknown) => {
        this.deps.registro.error({ erro, roboId: this.robo.id }, "falha ao consultar a aprovação");
      });
  }

  private async aoResponder(p: AprovacaoPendente, fim: FimAprovacao): Promise<void> {
    await this.protegido("concluir a aprovação", async () => {
      if (this.aprovacao !== p) return;
      this.aprovacao = null;
      const r = await concluirAprovacao(this.deps, this.robo, p, fim, await this.posicao());
      if (r.ordem && r.plano && r.decisaoId) await this.aposOrdem(r.ordem, r.plano, r.decisaoId);
      // Compra aprovada fora do candle: a proteção vai para o livro já, sem esperar o próximo minuto.
      if (r.ordem) await this.ajustarCorretora(p.entrada.preco);
    });
  }

  /** Antes de decidir, resolve as ordens de estado incerto (se houver). */
  private async semOrdemIncerta(): Promise<boolean> {
    for (const incerta of this.incertas) {
      const resultado = await conferirOrdemIncerta(this.deps, this.robo, incerta);
      if (!resultado) return false;
      this.incertas = this.incertas.filter((o) => o !== incerta);
      if (resultado.execucoes.length === 0) continue;
      if (incerta.lado === "COMPRA") this.aberta.esquecer();
      else await this.aposVenda();
      await publicarPosicao(this.deps, this.robo);
    }
    return true;
  }

  /** Confere e ajusta a proteção no livro (reconciliação na partida). */
  private async acompanharCorretora(preco: Valor | null): Promise<void> {
    await this.conferirCorretora();
    if (preco) await this.ajustarCorretora(preco);
  }

  /**
   * Antes de decidir: a proteção pode ter executado na corretora. Falha aqui não para a
   * vigia do robô (a segunda linha de defesa): vai para o registro e a saúde.
   */
  private async conferirCorretora(): Promise<void> {
    await this.semDerrubar("conferir a proteção na corretora", async () => {
      if (!(await conferirProtecao(this.deps, this.robo))) return;
      this.aberta.esquecer();
      const p = this.aprovacao;
      if (p?.plano.lado !== "VENDA" || !(await this.posicao()).quantidade.isZero()) return;
      this.aprovacao = null;
      await barrarPorPosicaoZerada(this.deps, p);
    });
  }

  /** Depois de decidir: a proteção no livro acompanha a posição e o stop efetivo de agora. */
  private ajustarCorretora(preco: Valor): Promise<void> {
    return this.semDerrubar("ajustar a proteção na corretora", () => this.stopNaCorretora.ajustar(preco));
  }

  private async semDerrubar(tarefa: string, fazer: () => Promise<void>): Promise<void> {
    try {
      await fazer();
    } catch (erro) {
      await this.registrarFalha(tarefa, erro);
    }
  }

  private async registrarFalha(tarefa: string, erro: unknown): Promise<void> {
    this.falhas++;
    this.deps.registro.error({ erro, roboId: this.robo.id }, `falha ao ${tarefa}`);
    await publicar(this.deps, {
      tipo: "saude",
      servico: "motor",
      ok: false,
      em: this.deps.relogio.agora(),
    });
  }

  private async posicao(): Promise<Posicao> {
    return posicaoDe(await this.deps.ordens.execucoes(this.robo.id));
  }

  private publicarPreco(c: Candle): Promise<void> {
    return publicar(this.deps, {
      tipo: "preco",
      simbolo: this.robo.simbolo,
      preco: paraTexto(c.fecha),
      em: c.fechamento,
    });
  }

  /** Erro numa decisão não derruba o robô nem some: vai para o registro e vira saúde ruim. */
  private protegido<T>(tarefa: string, fazer: () => Promise<T>): Promise<T | null> {
    return this.trava.executar(async () => {
      try {
        return await fazer();
      } catch (erro) {
        await this.registrarFalha(tarefa, erro);
        return null;
      }
    });
  }
}
