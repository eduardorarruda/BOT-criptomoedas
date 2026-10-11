import type { Fonte } from "@zentrade/contratos";

/**
 * Fontes que as ferramentas devolveram nesta análise. A proposta só pode citar o que
 * está aqui: fonte inventada pelo modelo é descartada antes de chegar ao motor.
 */
export class RegistroFontes {
  readonly #fontes = new Map<string, Fonte>();

  registrar(fonte: Fonte): void {
    this.#fontes.set(fonte.id, fonte);
  }

  conhece(id: string): boolean {
    return this.#fontes.has(id);
  }

  filtrar(citadas: readonly Fonte[]): { fontes: Fonte[]; removidas: number } {
    const fontes = citadas.filter((f) => this.conhece(f.id));
    return { fontes, removidas: citadas.length - fontes.length };
  }
}
