import type { ContaCorretora, RepositorioCarteira } from "@zentrade/banco";
import type { PortaCredenciais, StatusContaBinance } from "@zentrade/contratos";
import type { RestricoesChave } from "@zentrade/corretora";
import { erroDaBinance, type FabricaConta } from "./binance-conta.js";

export interface DependenciasStatus {
  readonly credenciais: PortaCredenciais;
  readonly carteira: Pick<RepositorioCarteira, "sincronizacao">;
  readonly criarConta: FabricaConta;
}

/** O que a pessoa precisa saber sobre a chave, em frases. Nada de conselho: fatos e o que fazer. */
export function avisosDaChave(rede: ContaCorretora["rede"], r: RestricoesChave | null): string[] {
  if (!r)
    return [
      rede === "testnet"
        ? "A testnet não informa as permissões da chave (não tem /sapi)."
        : "Não foi possível ler as permissões da chave agora.",
    ];
  const avisos: string[] = [];
  if (r.podeSacar)
    avisos.push(
      "BLOQUEADA: esta chave tem permissão de SAQUE, e os robôs não operam com ela. O ZenTrade nunca saca: crie outra chave sem saque na Binance e troque aqui.",
    );
  if (!r.ipRestrito)
    avisos.push(
      "ATENÇÃO: a chave não está presa a um IP. Quem a obtiver (vazamento, backup, máquina invadida) pode negociar na sua conta de qualquer lugar. A Binance recomenda restringir ao IP do servidor; faça isso se o seu IP for fixo.",
    );
  if (!r.podeNegociar)
    avisos.push(
      "A chave é só de leitura: a carteira funciona, mas os robôs não conseguem enviar ordens com ela.",
    );
  return avisos;
}

async function restricoesOuNull(ler: () => Promise<RestricoesChave | null>): Promise<RestricoesChave | null> {
  try {
    return await ler();
  } catch {
    // Permissão sem ler não derruba o status: aparece como desconhecida (null).
    return null;
  }
}

async function statusDaConta(
  d: DependenciasStatus,
  usuarioId: string,
  c: ContaCorretora,
): Promise<StatusContaBinance> {
  const sincronizacao = await d.carteira.sincronizacao(usuarioId, c.rede);
  const base = {
    id: c.id,
    rede: c.rede,
    apiKeyFinal: c.apiKeyFinal,
    sincronizacao: sincronizacao
      ? {
          em: sincronizacao.em,
          ok: sincronizacao.ok,
          erro: sincronizacao.erro,
          negociacoes: sincronizacao.negociacoes,
        }
      : null,
  };
  try {
    const credenciais = await d.credenciais.binance(usuarioId, c.rede);
    if (!credenciais) throw new Error("conta sem chave");
    const conta = d.criarConta(c.rede, credenciais);
    const { podeNegociar } = await conta.conta();
    const r = await restricoesOuNull(() => conta.restricoes());
    return {
      ...base,
      conectada: true,
      erro: null,
      podeNegociar: r ? r.podeNegociar && podeNegociar : podeNegociar,
      podeSacar: r?.podeSacar ?? null,
      ipRestrito: r?.ipRestrito ?? null,
      permissoesLidas: r !== null,
      avisos: avisosDaChave(c.rede, r),
    };
  } catch (erro) {
    const mensagem = erroDaBinance(erro).message;
    return {
      ...base,
      conectada: false,
      erro: mensagem,
      podeNegociar: null,
      podeSacar: null,
      ipRestrito: null,
      permissoesLidas: false,
      avisos: [],
    };
  }
}

/** O status de cada conta cadastrada, como a Binance a vê agora (uma conta que falha não derruba as outras). */
export function statusDasContas(
  d: DependenciasStatus,
  usuarioId: string,
  contas: readonly ContaCorretora[],
): Promise<StatusContaBinance[]> {
  return Promise.all(contas.map((c) => statusDaConta(d, usuarioId, c)));
}
