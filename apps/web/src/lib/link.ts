/**
 * Endereço que pode virar `href`: só http(s), já normalizado. Defesa em profundidade
 * além do contrato — texto de notícia vem de fora, e `javascript:` num link é XSS.
 */
export function linkSeguro(endereco: string | null | undefined): string | null {
  if (!endereco) return null;
  try {
    const url = new URL(endereco.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
