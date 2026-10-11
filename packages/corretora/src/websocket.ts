import type { EstadoConexao } from "@zentrade/contratos";
import { dec, type Candle } from "@zentrade/dominio";
import WebSocket from "ws";
import { z } from "zod";

export interface OpcoesAssinatura {
  /** Endereço completo do stream, ex.: wss://stream.binance.com:9443/ws/btcusdt@kline_1m */
  readonly url: string;
  readonly aoFechar: (candle: Candle) => void;
  readonly aoEstado?: ((estado: EstadoConexao) => void) | undefined;
  /** Falhas que não derrubam a assinatura (mensagem torta, quem consome lançou erro). */
  readonly aoErro?: ((erro: Error) => void) | undefined;
  readonly esperaInicialMs?: number;
  readonly esperaMaximaMs?: number;
  /** A Binance derruba toda conexão em 24 h; trocar antes evita o corte no meio de um candle. */
  readonly reconexaoPreventivaMs?: number;
  /** Sem mensagem nem ping por este tempo, a conexão é tida como morta. */
  readonly silencioMaximoMs?: number;
  readonly aleatorio?: () => number;
}

const MensagemKline = z.object({
  e: z.literal("kline"),
  k: z.object({
    t: z.number(),
    T: z.number(),
    o: z.string(),
    h: z.string(),
    l: z.string(),
    c: z.string(),
    v: z.string(),
    x: z.boolean(),
  }),
});

/**
 * Espera exponencial com teto e jitter ("metade fixa, metade sorteada"): muitos robôs
 * caindo juntos não voltam todos no mesmo milissegundo.
 */
export function calcularEspera(
  tentativa: number,
  inicialMs: number,
  maximaMs: number,
  aleatorio: () => number,
) {
  const teto = Math.min(maximaMs, inicialMs * 2 ** tentativa);
  return teto / 2 + aleatorio() * (teto / 2);
}

const comoErro = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

class AssinaturaKline {
  private socket: WebSocket | null = null;
  private tentativas = 0;
  private encerrada = false;
  private timerReconexao: NodeJS.Timeout | undefined;
  private timerPreventivo: NodeJS.Timeout | undefined;
  private timerSilencio: NodeJS.Timeout | undefined;

  constructor(private readonly o: OpcoesAssinatura) {}

  conectar(): void {
    const socket = new WebSocket(this.o.url);
    this.socket = socket;
    socket.on("open", () => this.aoAbrir(socket));
    socket.on("message", (dados: WebSocket.RawData) => this.aoMensagem(dados.toString()));
    socket.on("ping", () => this.vigiarSilencio(socket));
    socket.on("error", (erro: Error) => this.o.aoErro?.(erro));
    socket.on("close", () => this.aoFecharConexao(socket));
  }

  encerrar(): void {
    if (this.encerrada) return;
    this.encerrada = true;
    this.limparTimers();
    this.socket?.close();
    this.o.aoEstado?.("desconectado");
  }

  private aoAbrir(socket: WebSocket): void {
    this.tentativas = 0;
    this.o.aoEstado?.("conectado");
    this.vigiarSilencio(socket);
    clearTimeout(this.timerPreventivo);
    this.timerPreventivo = setTimeout(
      () => socket.terminate(),
      this.o.reconexaoPreventivaMs ?? 23 * 3_600_000,
    );
  }

  private aoMensagem(texto: string): void {
    if (this.socket) this.vigiarSilencio(this.socket);
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      this.o.aoErro?.(new Error(`Mensagem do WebSocket não é JSON: ${texto.slice(0, 80)}`));
      return;
    }
    const msg = MensagemKline.safeParse(bruto);
    if (!msg.success) {
      this.o.aoErro?.(new Error("Mensagem de kline fora do formato esperado; a API pode ter mudado."));
      return;
    }
    if (msg.data.k.x) this.entregar(msg.data.k);
  }

  private entregar(k: z.infer<typeof MensagemKline>["k"]): void {
    const candle: Candle = {
      abertura: k.t,
      fechamento: k.T,
      abre: dec(k.o),
      maxima: dec(k.h),
      minima: dec(k.l),
      fecha: dec(k.c),
      volume: dec(k.v),
    };
    try {
      this.o.aoFechar(candle);
    } catch (erro) {
      this.o.aoErro?.(comoErro(erro));
    }
  }

  private vigiarSilencio(socket: WebSocket): void {
    clearTimeout(this.timerSilencio);
    this.timerSilencio = setTimeout(() => socket.terminate(), this.o.silencioMaximoMs ?? 3 * 60_000);
  }

  private aoFecharConexao(socket: WebSocket): void {
    if (socket !== this.socket || this.encerrada) return;
    this.limparTimers();
    this.o.aoEstado?.("reconectando");
    const espera = calcularEspera(
      this.tentativas++,
      this.o.esperaInicialMs ?? 1_000,
      this.o.esperaMaximaMs ?? 60_000,
      this.o.aleatorio ?? Math.random,
    );
    this.timerReconexao = setTimeout(() => this.conectar(), espera);
  }

  private limparTimers(): void {
    clearTimeout(this.timerReconexao);
    clearTimeout(this.timerPreventivo);
    clearTimeout(this.timerSilencio);
  }
}

/**
 * Assina um stream de klines e chama `aoFechar` só com candles fechados. Reconecta
 * sozinha (espera crescente com teto e jitter), troca a conexão antes das 24 h e
 * derruba conexões mudas. O pong ao ping da Binance é automático na lib ws.
 */
export function assinarKlines(opcoes: OpcoesAssinatura): () => void {
  const assinatura = new AssinaturaKline(opcoes);
  assinatura.conectar();
  return () => assinatura.encerrar();
}
