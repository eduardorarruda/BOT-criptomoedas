/**
 * Exemplo vazio: `?vazio=1` abre o exemplo como uma instalação nova, sem robôs, sem
 * estratégias e sem histórico, para ver (e testar) a primeira vez. A aba lembra a
 * escolha nas telas seguintes; `?vazio=0` volta ao exemplo cheio.
 */
const CHAVE = "zentrade:demo:vazio";

export function lerModoVazio(busca: string, armazenamento: Storage | undefined): boolean {
  const valor = new URLSearchParams(busca).get("vazio");
  try {
    if (valor === "1") armazenamento?.setItem(CHAVE, "1");
    if (valor === "0") armazenamento?.removeItem(CHAVE);
    if (valor === null) return armazenamento?.getItem(CHAVE) === "1";
  } catch {
    // sem armazenamento: vale só o parâmetro desta abertura
  }
  return valor === "1";
}
