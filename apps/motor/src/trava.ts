/**
 * Fila de uma tarefa por vez. Cada robô tem a sua: duas decisões do mesmo robô nunca
 * rodam em paralelo (o bot antigo comprava em dobro quando dois candles chegavam juntos).
 */
export class Trava {
  private fila: Promise<unknown> = Promise.resolve();

  executar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = this.fila.then(tarefa);
    // A fila segue mesmo se a tarefa falhar; o erro chega a quem chamou por `resultado`.
    this.fila = resultado.catch(() => undefined);
    return resultado;
  }

  /** Resolve quando tudo o que já foi enfileirado terminou. */
  async ocioso(): Promise<void> {
    await this.fila;
  }
}
