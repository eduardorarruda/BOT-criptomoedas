import type { FonteCitada } from "@zentrade/contratos";

/** Até onde a lista de fontes de uma resposta vai (o contrato aceita 50). */
const MAXIMO = 50;

/**
 * Fontes que as ferramentas devolveram durante uma resposta do chat: é o que a tela mostra
 * em "Fontes consultadas". Só entra o que veio de uma ferramenta — o modelo não inventa.
 */
export class RegistroCitacoes {
  readonly #fontes = new Map<string, FonteCitada>();

  registrar(fonte: FonteCitada): void {
    if (this.#fontes.size < MAXIMO || this.#fontes.has(fonte.id)) this.#fontes.set(fonte.id, fonte);
  }

  get lista(): FonteCitada[] {
    return [...this.#fontes.values()];
  }
}
