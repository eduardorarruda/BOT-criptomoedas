/**
 * Teto de custo de IA: cada análise gasta tokens, e o segredo do /analisar sozinho
 * não limita quantas chamadas alguém na rede interna consegue disparar. Limita as
 * análises em andamento e as iniciadas na última janela de um minuto.
 */
const JANELA_MS = 60_000;

export class LimiteAnalises {
  #emAndamento = 0;
  #inicios: number[] = [];

  constructor(
    private readonly maxSimultaneas: number,
    private readonly maxPorMinuto: number,
    private readonly agora: () => number = Date.now,
  ) {}

  /** Reserva uma vaga; `false` quando passou de qualquer um dos limites. */
  entrar(): boolean {
    const t = this.agora();
    this.#inicios = this.#inicios.filter((inicio) => t - inicio < JANELA_MS);
    if (this.#emAndamento >= this.maxSimultaneas || this.#inicios.length >= this.maxPorMinuto) return false;
    this.#emAndamento++;
    this.#inicios.push(t);
    return true;
  }

  sair(): void {
    this.#emAndamento = Math.max(0, this.#emAndamento - 1);
  }
}
