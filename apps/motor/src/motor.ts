import { publicar } from "./nucleo/diario.js";
import type { Dependencias } from "./nucleo/tipos.js";
import { RoboAoVivo } from "./robo.js";

export interface OpcoesMotor {
  /** O vigia de saúde (n8n) espera um sinal de vida a cada 30 s. */
  readonly intervaloSaudeMs?: number;
}

/**
 * Liga um RoboAoVivo por robô ativo e avisa que está vivo. Robô que não liga é
 * registrado e deixa a saúde ruim — o bot antigo morria em silêncio.
 */
export class Motor {
  private robos: readonly RoboAoVivo[] = [];
  private falharamAoLigar = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly deps: Dependencias,
    private readonly opcoes: OpcoesMotor = {},
  ) {}

  async iniciar(): Promise<{ ligados: number; falharam: number }> {
    const configs = await this.deps.robos.ativos();
    const tentativas = await Promise.all(configs.map((c) => this.ligar(new RoboAoVivo(c, this.deps))));
    this.robos = tentativas.filter((r): r is RoboAoVivo => r !== null);
    this.falharamAoLigar = tentativas.length - this.robos.length;
    this.timer = setInterval(() => void this.publicarSaude(), this.opcoes.intervaloSaudeMs ?? 30_000);
    await this.publicarSaude();
    return { ligados: this.robos.length, falharam: this.falharamAoLigar };
  }

  saudavel(): boolean {
    return this.falharamAoLigar === 0 && this.robos.every((r) => r.conectado());
  }

  publicarSaude(): Promise<void> {
    return publicar(this.deps, {
      tipo: "saude",
      servico: "motor",
      ok: this.saudavel(),
      em: this.deps.relogio.agora(),
    });
  }

  /** Resolve quando nenhum robô está decidindo. */
  async ocioso(): Promise<void> {
    await Promise.all(this.robos.map((r) => r.ocioso()));
  }

  /** Para de ouvir candles, espera as decisões em andamento e avisa que saiu. */
  async parar(): Promise<void> {
    clearInterval(this.timer);
    await Promise.all(this.robos.map((r) => r.parar()));
    this.robos = [];
    await publicar(this.deps, { tipo: "saude", servico: "motor", ok: false, em: this.deps.relogio.agora() });
  }

  private async ligar(robo: RoboAoVivo): Promise<RoboAoVivo | null> {
    try {
      await robo.iniciar();
      return robo;
    } catch (erro) {
      this.deps.registro.error({ erro, roboId: robo.robo.id }, "robô não ligou");
      return null;
    }
  }
}
