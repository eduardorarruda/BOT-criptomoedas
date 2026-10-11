import type { RoboConfig } from "@zentrade/contratos";
import { decidir, paraTexto, posicaoDe, type Candle, type Estrategia, type Posicao } from "@zentrade/dominio";
import { BufferCandles } from "../buffer.js";
import { Trava } from "../trava.js";
import { processarSinal, type ResultadoCiclo } from "./ciclo.js";
import { publicar } from "./diario.js";
import type { AjustePosicao } from "./protecao.js";
import { conferirOrdemIncerta, type OrdemIncerta } from "./reconciliacao.js";
import type { Dependencias } from "./tipos.js";

/**
 * O robô sem rede: recebe candles fechados e decide. É o mesmo código ao vivo e no
 * backtest. Uma trava garante uma decisão por vez; o buffer recusa candle repetido.
 */
export class NucleoRobo {
  private readonly buffer: BufferCandles;
  private readonly trava = new Trava();
  private ultimoMinuto = 0;
  /** Stop/alvo mais conservadores da compra (agente), aplicados à posição aberta. Some ao reiniciar. */
  private ajuste: AjustePosicao | null = null;
  private falhas = 0;
  private incerta: OrdemIncerta | null = null;

  constructor(
    readonly robo: RoboConfig,
    private readonly deps: Dependencias,
  ) {
    this.buffer = new BufferCandles(deps.opcoes.tamanhoHistorico);
  }

  get totalFalhas(): number {
    return this.falhas;
  }

  historico(): Candle[] {
    return this.buffer.lista();
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
      await this.publicarPreco(candle);
      if (!(await this.semOrdemIncerta())) return null;
      const posicao = await this.posicao();
      const sinal = decidir(
        this.estrategia(posicao),
        { fechamentos: this.buffer.fechamentos(), preco: candle.fecha },
        posicao,
      );
      return this.seguir({ sinal, preco: candle.fecha, posicao, em: candle.fechamento });
    });
  }

  /** Candle de 1 minuto: só vigia stop e alvo da posição aberta, entre um candle do intervalo e outro. */
  aoFecharMinuto(candle: Candle): Promise<ResultadoCiclo | null> {
    return this.protegido("vigiar stop e alvo", async () => {
      if (candle.abertura <= this.ultimoMinuto) return null;
      this.ultimoMinuto = candle.abertura;
      await this.publicarPreco(candle);
      if (!(await this.semOrdemIncerta())) return null;
      const posicao = await this.posicao();
      if (posicao.quantidade.isZero()) return null;
      const { saida: _ignorada, ...soStopEAlvo } = this.estrategia(posicao);
      const sinal = decidir(
        soStopEAlvo,
        { fechamentos: this.buffer.fechamentos(), preco: candle.fecha },
        posicao,
      );
      if (sinal.acao !== "VENDER") return null;
      return this.seguir({ sinal, preco: candle.fecha, posicao, em: candle.fechamento });
    });
  }

  /** Resolve quando não há decisão em andamento (desligamento gracioso). */
  ocioso(): Promise<void> {
    return this.trava.ocioso();
  }

  private async seguir(
    e: Omit<Parameters<typeof processarSinal>[2], "fechamentos">,
  ): Promise<ResultadoCiclo> {
    const r = await processarSinal(this.deps, this.robo, { ...e, fechamentos: this.buffer.fechamentos() });
    if (r.ordem && r.ordem.execucoes.length > 0 && r.plano?.lado === "COMPRA" && r.plano.ajuste)
      this.ajuste = r.plano.ajuste;
    if (r.ordem?.estado === "PENDENTE" && r.ordem.execucoes.length === 0 && r.plano && r.decisaoId)
      this.incerta = {
        idCliente: r.ordem.idCliente,
        decisaoId: r.decisaoId,
        lado: r.plano.lado,
        quantidade: r.plano.quantidade,
        criadaEm: this.deps.relogio.agora(),
      };
    return r;
  }

  /** Antes de decidir, resolve a ordem de estado incerto (se houver). */
  private async semOrdemIncerta(): Promise<boolean> {
    if (!this.incerta) return true;
    const resolvida = await conferirOrdemIncerta(this.deps, this.robo, this.incerta);
    if (resolvida) this.incerta = null;
    return resolvida;
  }

  private estrategia(posicao: Posicao): Estrategia {
    if (posicao.quantidade.isZero()) this.ajuste = null;
    return this.ajuste ? { ...this.robo.estrategia, ...this.ajuste } : this.robo.estrategia;
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
        this.falhas++;
        this.deps.registro.error({ erro, roboId: this.robo.id }, `falha ao ${tarefa}`);
        await publicar(this.deps, {
          tipo: "saude",
          servico: "motor",
          ok: false,
          em: this.deps.relogio.agora(),
        });
        return null;
      }
    });
  }
}
