import type { EstadoConexao, RoboConfig } from "@zentrade/contratos";
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
  private paradas: (() => void)[] = [];
  private recuperando: Promise<void> = Promise.resolve();

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
    const historia = await corretora.candles(
      this.robo.simbolo,
      this.robo.intervalo,
      this.deps.opcoes.tamanhoHistorico,
    );
    await this.nucleo.completarHistorico(historia);
    this.assinar("intervalo", (c) => void this.nucleo.aoFecharIntervalo(c));
    // Com intervalo de 1 min, o próprio candle do intervalo já vigia stop e alvo.
    if (this.robo.intervalo !== "1m") this.assinar("minuto", (c) => void this.nucleo.aoFecharMinuto(c));
    this.deps.registro.info({ roboId: this.robo.id, candles: historia.length }, "robô ligado");
  }

  conectado(): boolean {
    return this.estados.size > 0 && [...this.estados.values()].every((e) => e === "conectado");
  }

  /** Resolve quando não há decisão nem recuperação em andamento. */
  async ocioso(): Promise<void> {
    await this.recuperando;
    await this.nucleo.ocioso();
  }

  /** Desligamento gracioso: para de ouvir e espera a decisão em andamento terminar. */
  async parar(): Promise<void> {
    this.paradas.forEach((parar) => parar());
    this.paradas = [];
    await this.ocioso();
    this.deps.registro.info({ roboId: this.robo.id }, "robô desligado");
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
    } catch (erro) {
      this.deps.registro.error(
        { erro, roboId: this.robo.id },
        "falha ao completar os candles perdidos na queda",
      );
    }
  }
}
