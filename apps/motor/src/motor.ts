import type { AlertaEmitido, Corretora, RoboConfig } from "@zentrade/contratos";
import { formatarDuracao } from "@zentrade/dominio";
import { publicar } from "./nucleo/diario.js";
import type { Dependencias } from "./nucleo/tipos.js";
import { RoboAoVivo } from "./robo.js";
import { Trava } from "./trava.js";

export interface OpcoesMotor {
  /** O vigia de saúde (n8n) espera um sinal de vida a cada 30 s. */
  readonly intervaloSaudeMs?: number;
  /** Relê os robôs ativos (robô novo, pausado ou alterado) sem reiniciar o processo. Sem isto, não relê. */
  readonly intervaloRecargaMs?: number;
  /** "Estou vivo": a API lê a batida (Redis) para o /saude. */
  readonly bater?: (em: number) => Promise<void>;
  /** Antes de ligar cada robô (ex.: o papel refaz o saldo a partir das execuções gravadas). */
  readonly preparar?: (robo: RoboConfig) => Promise<void>;
  /** A corretora do robô (a da pessoa dona dele, com a chave dela). Sem isto, a de `deps`. */
  readonly corretoraDe?: (robo: RoboConfig) => Promise<Corretora>;
  /** WebSocket de candles fora do ar por mais que isto vira alerta. Padrão: 5 min. */
  readonly alertaWebSocketMs?: number;
}

const ALERTA_WEBSOCKET_PADRAO_MS = 5 * 60_000;
const LIMITE_MOTIVO = 600;

export interface ResultadoRecarga {
  readonly ligados: number;
  readonly desligados: number;
  readonly falharam: number;
}

interface Ligado {
  readonly robo: RoboAoVivo;
  readonly assinatura: string;
}

/** Robô alterado (modo, limites, estratégia...) muda a assinatura e é religado. Decimais saem em texto. */
const assinatura = (c: RoboConfig): string => JSON.stringify(c);

/**
 * Liga um RoboAoVivo por robô ativo, relê a lista periodicamente e avisa que está
 * vivo. Robô que não liga é registrado e deixa a saúde ruim — o bot antigo morria em
 * silêncio. O estado que importa mora nas portas: religar um robô não perde nada.
 */
export class Motor {
  private robos: ReadonlyMap<string, Ligado> = new Map();
  private falharam = 0;
  private readonly trava = new Trava();
  private timers: NodeJS.Timeout[] = [];
  private parado = false;
  /** Quedas de WebSocket já avisadas (robô → início da queda): uma queda, um alerta. */
  private quedasAvisadas: ReadonlyMap<string, number> = new Map();

  constructor(
    private readonly deps: Dependencias,
    private readonly opcoes: OpcoesMotor = {},
  ) {}

  async iniciar(): Promise<{ ligados: number; falharam: number }> {
    await this.recarregar();
    this.timers = [setInterval(() => void this.publicarSaude(), this.opcoes.intervaloSaudeMs ?? 30_000)];
    if (this.opcoes.intervaloRecargaMs)
      this.timers = [
        ...this.timers,
        setInterval(() => void this.recarregar(), this.opcoes.intervaloRecargaMs),
      ];
    await this.publicarSaude();
    return { ligados: this.robos.size, falharam: this.falharam };
  }

  ligados(): string[] {
    return [...this.robos.keys()];
  }

  saudavel(): boolean {
    return this.falharam === 0 && [...this.robos.values()].every((l) => l.robo.conectado());
  }

  async publicarSaude(): Promise<void> {
    const em = this.deps.relogio.agora();
    await publicar(this.deps, { tipo: "saude", servico: "motor", ok: this.saudavel(), em });
    await this.vigiarQuedas(em);
    if (!this.opcoes.bater) return;
    try {
      await this.opcoes.bater(em);
    } catch (erro) {
      this.deps.registro.error({ erro }, "falha ao gravar a batida do motor no Redis");
    }
  }

  /** Avisa uma vez por queda o robô cujo WebSocket de candles está fora há mais que o limite. */
  private async vigiarQuedas(agora: number): Promise<void> {
    const limite = this.opcoes.alertaWebSocketMs ?? ALERTA_WEBSOCKET_PADRAO_MS;
    const quedas = [...this.robos.values()].flatMap(({ robo }) => {
      const desde = robo.foraDoArDesde();
      return desde === null ? [] : [{ config: robo.robo, desde }];
    });
    this.quedasAvisadas = new Map(
      [...this.quedasAvisadas].filter(([id, desde]) =>
        quedas.some((q) => q.config.id === id && q.desde === desde),
      ),
    );
    for (const { config, desde } of quedas) {
      if (agora - desde < limite || this.quedasAvisadas.get(config.id) === desde) continue;
      this.quedasAvisadas = new Map([...this.quedasAvisadas, [config.id, desde]]);
      await this.alertar(config, {
        tipo: "websocket_fora",
        gravidade: "critico",
        titulo: `Sem preço ao vivo: ${config.simbolo}`,
        mensagem: `A conexão de candles do robô ${config.simbolo} (${config.rede}) está fora há ${formatarDuracao(agora - desde)}. Sem candles o robô não decide nem vigia o stop pelo preço; o motor segue tentando reconectar. Se demorar, confira a internet do servidor ou ligue a parada total.`,
        chave: `websocket_fora:${config.id}:${desde}`,
        em: agora,
      });
    }
  }

  private alertar(
    config: RoboConfig,
    a: Pick<AlertaEmitido, "tipo" | "gravidade" | "titulo" | "mensagem" | "chave" | "em">,
  ): Promise<void> {
    return publicar(this.deps, {
      tipo: "alerta",
      alerta: { ...a, roboId: config.id, usuarioId: config.usuarioId },
    });
  }

  /** Uma recarga por vez. Falha ao ler a lista não mexe nos robôs que estão rodando. */
  recarregar(): Promise<ResultadoRecarga> {
    return this.trava.executar(async () => {
      if (this.parado) return { ligados: 0, desligados: 0, falharam: this.falharam };
      let configs: RoboConfig[];
      try {
        configs = await this.deps.robos.ativos();
      } catch (erro) {
        this.deps.registro.error({ erro }, "falha ao recarregar os robôs: os atuais seguem rodando");
        return { ligados: 0, desligados: 0, falharam: this.falharam };
      }
      const desligados = await this.desligarSaidos(configs);
      const novos = configs.filter((c) => !this.robos.has(c.id));
      const tentativas = await Promise.all(novos.map((c) => this.ligar(c)));
      const ligados = tentativas.filter((l): l is Ligado => l !== null);
      this.robos = new Map([...this.robos, ...ligados.map((l) => [l.robo.robo.id, l] as const)]);
      this.falharam = tentativas.length - ligados.length;
      return { ligados: ligados.length, desligados, falharam: this.falharam };
    });
  }

  /** Resolve quando nenhum robô está decidindo. */
  async ocioso(): Promise<void> {
    await Promise.all([...this.robos.values()].map((l) => l.robo.ocioso()));
  }

  /** Para de ouvir candles, espera as decisões em andamento e avisa que saiu. */
  async parar(): Promise<void> {
    this.parado = true;
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    await this.trava.executar(async () => {
      await Promise.all([...this.robos.values()].map((l) => l.robo.parar()));
      this.robos = new Map();
    });
    await publicar(this.deps, { tipo: "saude", servico: "motor", ok: false, em: this.deps.relogio.agora() });
  }

  /** Desliga quem saiu da lista (pausado, apagado) ou mudou; os que mudaram voltam já com a config nova. */
  private async desligarSaidos(configs: readonly RoboConfig[]): Promise<number> {
    const atuais = new Map(configs.map((c) => [c.id, assinatura(c)]));
    const saem = [...this.robos.entries()].filter(([id, l]) => atuais.get(id) !== l.assinatura);
    await Promise.all(saem.map(([, l]) => l.robo.parar()));
    this.robos = new Map([...this.robos].filter(([id]) => !saem.some(([s]) => s === id)));
    saem.forEach(([id]) =>
      this.deps.registro.info({ roboId: id }, "robô desligado na recarga (pausado ou alterado)"),
    );
    return saem.length;
  }

  private async ligar(config: RoboConfig): Promise<Ligado | null> {
    let robo: RoboAoVivo | null = null;
    try {
      const corretora = this.opcoes.corretoraDe ? await this.opcoes.corretoraDe(config) : this.deps.corretora;
      robo = new RoboAoVivo(config, { ...this.deps, corretora });
      await this.opcoes.preparar?.(config);
      await robo.iniciar();
      return { robo, assinatura: assinatura(config) };
    } catch (erro) {
      this.deps.registro.error({ erro, roboId: config.id }, "robô não ligou");
      const motivo = (erro instanceof Error ? erro.message : String(erro)).slice(0, LIMITE_MOTIVO);
      await this.alertar(config, {
        tipo: "robo_nao_ligou",
        gravidade: "critico",
        titulo: `Robô ${config.simbolo} não ligou`,
        mensagem: `O robô ${config.simbolo} (${config.rede}) não ligou: ${motivo} Ele tenta de novo a cada recarga do motor.`,
        chave: `robo_nao_ligou:${config.id}`,
        em: this.deps.relogio.agora(),
      });
      await robo
        ?.parar()
        .catch((e: unknown) =>
          this.deps.registro.warn({ erro: e, roboId: config.id }, "falha ao limpar o robô que não ligou"),
        );
      return null;
    }
  }
}
