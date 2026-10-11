import type { CredenciaisCorretora, PortaCredenciais, RedeConta } from "@zentrade/contratos";
import type { Db } from "../cliente.js";
import { repositorioContas } from "../repositorios/contas.js";

/**
 * As chaves da Binance de cada pessoa, decifradas com a chave mestra
 * (ZENTRADE_CHAVE_MESTRA). Acesso de sistema, sem RLS: quem usa é o motor (para operar
 * pelo robô da pessoa) e a API (para ler a carteira). O segredo nunca sai pela API.
 */
export function portaCredenciais(db: Db, chaveMestra: Buffer): PortaCredenciais {
  const contas = repositorioContas(db, chaveMestra);
  return {
    binance: (usuarioId: string, rede: RedeConta): Promise<CredenciaisCorretora | null> =>
      contas.credenciais(usuarioId, rede),
  };
}
