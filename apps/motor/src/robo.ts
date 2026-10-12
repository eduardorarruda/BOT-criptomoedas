import type { EstadoConexao, Intervalo, RoboConfig } from "@zentrade/contratos";
import type { Candle } from "@zentrade/dominio";
import { ErroConfiguracao } from "@zentrade/corretora";
import { NucleoRobo } from "./nucleo/nucleo-robo.js";
import type { Dependencias } from "./nucleo/tipos.js";

type Fluxo = "intervalo" | "minuto";

/**
 * O robô ao vivo: carrega a história pela REST, assina os candles do intervalo (decisão)
 * e de 1 min (vigia stop e alvo) e, a cada reconexão, completa os candles perdidos.
 * O estado que importa (posição) mora nas portas; a conexão pode cair à vontade.
 */
export class RoboAoVivo {
  readonly nucleo: NucleoRobo;
  private readonly estados = new Map<Fluxo, EstadoConexao>();
  /** Desde quando algum fluxo de candles está fora; `null` com tudo conectado. */
  private foraDesde: number | null = null;
  private paradas: (() => void)[] = [];
  private recuperando: Promise<void> = Promise.resolve();
  private gravando: Promise<void> = Promise.resolve();

  constructor(
    readonly robo: RoboConfig,
    private readonly deps: Dependencias,
  ) {
    this.nucleo = new NucleoRobo(robo, deps);
  }

  async iniciar(): Promise<void> {
    const { corretora } = this.deps;
    if (this.robo.rede !== corretora.rede)
      throw new ErroConfiguracao(
        `O robô ${this.robo.id} é da rede "${this.robo.rede}", mas o motor está ligado em "${corretora.rede}". Uma fonte só de preço: ajuste a rede do robô ou do motor.`,
      );
    await this.nucleo.restaurar();
    const historia = await corretora.candles(
      this.robo.simbolo,
      this.robo.intervalo,
      this.deps.opcoes.tamanhoHistorico,
    );
    await this.nucleo.completarHistorico(historia);
    this.gravar(this.robo.intervalo, historia);
    await this.nucleo.reconciliarProtecao(historia.at(-1)?.fecha ?? null);
    this.assinar("intervalo", (c) => {
      this.gravar(this.robo.intervalo, [c]);
      void this.nucleo.aoFecharIntervalo(c);
    });
    // Com intervalo de 1 min, o próprio candle do intervalo já vigia stop e alvo.
    if (this.robo.intervalo !== "1m")
      this.assinar("minuto", (c) => {
        this.gravar("1m", [c]);
        void this.nucleo.aoFecharMinuto(c);
      });
    this.deps.registro.info({ roboId: this.robo.id, candles: historia.length }, "robô ligado");
  }

  conectado(): boolean {
    return this.estados.size > 0 && [...this.estados.values()].every((e) => e === "conectado");
  }

  /** Instante em que a conexão de candles caiu (o fluxo mais antigo fora), ou `null`. */
  foraDoArDesde(): number | null {
    return this.foraDesde;
  }

  /** Resolve quando não há decisão nem recuperação em andamento. */
  async ocioso(): Promise<void> {
    await this.recuperando;
    await this.nucleo.ocioso();
  }

  /** Desligamento gracioso: para de ouvir, encerra a espera de aprovação e espera a decisão em andamento. */
  async parar(): Promise<void> {
    this.paradas.forEach((parar) => parar());
    this.paradas = [];
    await this.nucleo.parar();
    await this.ocioso();
    await this.gravando;
    this.deps.registro.info({ roboId: this.robo.id }, "robô desligado");
  }

  /**
   * Grava os candles fechados (gráfico e backtest) em fila, sem segurar a decisão.
   * Falha aqui não para o robô: vai para o registro.
   */
  private gravar(intervalo: Intervalo, candles: readonly Candle[]): void {
    const porta = this.deps.candles;
    if (!porta || candles.length === 0) return;
    this.gravando = this.gravando
      .then(() => porta.gravar(this.robo.simbolo, intervalo, candles))
      .catch((erro: unknown) =>
        this.deps.registro.warn(
          { erro, roboId: this.robo.id, intervalo },
          "falha ao gravar candles no banco",
        ),
      );
  }

  private assinar(fluxo: Fluxo, aoFechar: Parameters<Dependencias["corretora"]["assinarCandles"]>[2]): void {
    const intervalo = fluxo === "intervalo" ? this.robo.intervalo : "1m";
    const parar = this.deps.corretora.assinarCandles(this.robo.simbolo, intervalo, aoFechar, (e) =>
      this.aoEstado(fluxo, e),
    );
    this.paradas = [...this.paradas, parar];
  }

  private aoEstado(fluxo: Fluxo, estado: EstadoConexao): void {
    const anterior = this.estados.get(fluxo);
    this.estados.set(fluxo, estado);
    if (this.conectado()) this.foraDesde = null;
    else if (estado !== "conectado") this.foraDesde ??= this.deps.relogio.agora();
    if (estado !== "conectado" && estado !== anterior)
      this.deps.registro.warn({ roboId: this.robo.id, fluxo, estado }, "conexão de candles mudou");
    if (fluxo === "intervalo" && estado === "conectado" && anterior !== "conectado")
      this.recuperando = this.recuperando.then(() => this.recuperarLacuna());
  }

  private async recuperarLacuna(): Promise<void> {
    try {
      const candles = await this.deps.corretora.candles(
        this.robo.simbolo,
        this.robo.intervalo,
        this.deps.opcoes.tamanhoHistorico,
      );
      await this.nucleo.completarHistorico(candles);
      this.gravar(this.robo.intervalo, candles);
    } catch (erro) {
      this.deps.registro.error(
        { erro, roboId: this.robo.id },
        "falha ao completar os candles perdidos na queda",
      );
    }
  }
}
