import { lookup as lookupDns, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { ErroExtracao } from "./tipos.js";

/** Decide se um IP pode ser alcançado. O padrão só aceita endereço público (unicast global). */
export type PermitirEndereco = (ip: string) => boolean;

/**
 * Só endereço público: nada de loopback, rede privada (10/8, 172.16/12, 192.168/16),
 * link-local (169.254/16, onde fica o metadata das nuvens), CGNAT, multicast, reservado,
 * nem IPv6 local/único ou IPv4 embutido em IPv6. É a defesa contra SSRF do "baixar link".
 */
export function enderecoPublico(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let endereco = ipaddr.parse(ip);
  if (endereco.kind() === "ipv6") {
    const v6 = endereco as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) endereco = v6.toIPv4Address();
  }
  return endereco.range() === "unicast";
}

export const ERRO_REDE_INTERNA =
  "Esse endereço aponta para a rede interna ou para um endereço reservado; só links públicos são aceitos.";

/** Host que já é um IP ("10.0.0.1", "[::1]"): o Node não chama o lookup, então é conferido aqui. */
export function conferirHostLiteral(hostname: string, permitir: PermitirEndereco): void {
  const semColchetes = hostname.replace(/^\[(.*)\]$/, "$1");
  if (isIP(semColchetes) !== 0 && !permitir(semColchetes)) throw new ErroExtracao(ERRO_REDE_INTERNA);
}

type RetornoLookup = (erro: Error | null, endereco?: string | LookupAddress[], familia?: number) => void;

/**
 * `lookup` para o http/https do Node: resolve o nome e só deixa conectar se TODOS os
 * endereços forem permitidos. Como a conexão usa exatamente o IP conferido aqui, um DNS
 * que troca de resposta entre a checagem e a conexão (DNS rebinding) não passa.
 */
export function lookupSeguro(permitir: PermitirEndereco, resolver = lookupDns) {
  return (hostname: string, opcoes: { family?: number; all?: boolean }, retorno: RetornoLookup): void => {
    resolver(hostname, { all: true, family: opcoes.family ?? 0 }, (erro, enderecos) => {
      if (erro) return retorno(erro);
      if (enderecos.length === 0 || enderecos.some((e) => !permitir(e.address))) {
        return retorno(new ErroExtracao(ERRO_REDE_INTERNA));
      }
      const [primeiro] = enderecos as [LookupAddress, ...LookupAddress[]];
      return opcoes.all ? retorno(null, enderecos) : retorno(null, primeiro.address, primeiro.family);
    });
  };
}
