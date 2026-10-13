/**
 * Em quem a API confia como proxy reverso, no formato do proxy-addr: nomes prontos
 * ("loopback", "uniquelocal" = redes privadas) ou endereços/CIDRs separados por vírgula.
 * No Docker, o nginx da tela fica na rede privada e SOBRESCREVE o X-Forwarded-For com o
 * IP real da conexão, então o que um cliente forjar no cabeçalho não chega aqui.
 * Vazio: ninguém é proxy e vale o endereço da conexão. Nunca use `true` (confiar em
 * todos): qualquer um forjaria o próprio IP e escaparia do limite de tentativas.
 */
export function confiancaNoProxy(confiavel: string): string | false {
  const lista = confiavel.trim();
  return lista === "" ? false : lista;
}
