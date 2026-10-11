/** Espera uma condição ficar verdadeira (testes com rede local). */
export async function esperarAte(condicao: () => boolean, limiteMs = 3_000): Promise<void> {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) throw new Error("a condição não ficou verdadeira a tempo");
    await new Promise((r) => setTimeout(r, 10));
  }
}
