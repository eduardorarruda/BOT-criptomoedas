import type { CredenciaisCorretora, RedeConta } from "@zentrade/contratos";
import { ErroConfiguracao, type RestricoesChave } from "@zentrade/corretora";

export type LerRestricoes = (rede: RedeConta, c: CredenciaisCorretora) => Promise<RestricoesChave | null>;

/**
 * Antes de operar com a chave de dinheiro real, confere as permissões na Binance: chave
 * com SAQUE não opera (a API já recusa cadastrar; isto cobre chaves antigas e a
 * permissão ligada depois, na própria Binance). Sem conseguir conferir, também não
 * opera: na dúvida, dinheiro real fica parado. A testnet não tem saque nem /sapi.
 */
export function conferirChaveParaOperar(ler: LerRestricoes) {
  return async (rede: RedeConta, c: CredenciaisCorretora): Promise<void> => {
    if (rede !== "real") return;
    let r: RestricoesChave | null;
    try {
      r = await ler(rede, c);
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      throw new ErroConfiguracao(
        `Não deu para conferir as permissões da chave da Binance (${detalhe}). Sem conferir, o robô de dinheiro real não liga; o motor tenta de novo na próxima recarga.`,
      );
    }
    if (!r)
      throw new ErroConfiguracao(
        "A Binance não informou as permissões da chave. Sem conferir, o robô de dinheiro real não liga.",
      );
    if (r.podeSacar)
      throw new ErroConfiguracao(
        "A chave da Binance tem permissão de SAQUE. O ZenTrade não opera com ela: crie na Binance uma chave sem saque (só leitura e negociação spot) e troque em Contas e chaves.",
      );
  };
}
