import type { PortaRobos, RoboConfig } from "@zentrade/contratos";

/**
 * O banco guarda robôs de todas as redes e de todas as pessoas; o motor liga só os da
 * rede em que está (uma fonte só de preço). Dinheiro real nunca: o motor não roda em "real".
 */
export class RobosDaRede implements PortaRobos {
  constructor(
    private readonly todos: PortaRobos,
    private readonly rede: "papel" | "testnet",
  ) {}

  async ativos(): Promise<RoboConfig[]> {
    return (await this.todos.ativos()).filter((r) => r.rede === this.rede);
  }

  pausado(roboId: string): Promise<boolean> {
    return this.todos.pausado(roboId);
  }
}
